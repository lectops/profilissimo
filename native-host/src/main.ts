import { validateRequest, type NMHResponse } from "./schema.js";
import { discoverProfiles } from "./profiles.js";
import { launchInProfile } from "./launcher.js";
import { readConfig, writeConfig } from "./config.js";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

const MAX_MESSAGE_LENGTH = 1024 * 1024; // 1 MB — Chrome NMH protocol limit
const READ_TIMEOUT_MS = 10_000;

function readExactly(stream: NodeJS.ReadableStream, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytesRead = 0;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Read timed out"));
    }, READ_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      stream.removeListener("readable", onReadable);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error("stdin closed before message was fully read"));
    };

    const onReadable = () => {
      while (bytesRead < length) {
        const remaining = length - bytesRead;
        const chunk = (stream as NodeJS.ReadStream).read(remaining) as Buffer | null;
        if (!chunk) return;
        chunks.push(chunk);
        bytesRead += chunk.length;
      }
      cleanup();
      resolve(Buffer.concat(chunks, length));
    };

    stream.on("readable", onReadable);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
}

async function readMessage(): Promise<Buffer> {
  const header = await readExactly(process.stdin, 4);
  const messageLength = header.readUInt32LE(0);

  if (messageLength === 0) {
    throw new Error("Empty message");
  }

  if (messageLength > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message too large: ${messageLength} bytes (max ${MAX_MESSAGE_LENGTH})`);
  }

  return readExactly(process.stdin, messageLength);
}

function writeMessage(response: NMHResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(response);
    const body = Buffer.from(json, "utf-8");

    if (body.length > MAX_MESSAGE_LENGTH) {
      reject(new Error(`Response too large: ${body.length} bytes (max ${MAX_MESSAGE_LENGTH})`));
      return;
    }

    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);

    const writeBody = () => {
      process.stdout.write(body, (err) => {
        if (err) reject(err);
        else resolve();
      });
    };

    if (process.stdout.write(header)) {
      writeBody();
    } else {
      process.stdout.once("drain", writeBody);
    }
  });
}

async function handleMessage(raw: Buffer): Promise<NMHResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf-8"));
  } catch {
    return { success: false, error: "Invalid JSON" };
  }

  const validation = validateRequest(parsed);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { request } = validation;

  switch (request.action) {
    case "health_check":
      return { success: true };

    case "list_profiles":
      try {
        const profiles = await discoverProfiles();
        return { success: true, profiles };
      } catch (err) {
        return { success: false, error: errorMessage(err) };
      }

    case "open_url":
      try {
        await launchInProfile(request.url, request.targetProfile);
        return { success: true };
      } catch (err) {
        return { success: false, error: errorMessage(err) };
      }

    case "get_config":
      try {
        const config = await readConfig();
        return { success: true, config };
      } catch (err) {
        return { success: false, error: errorMessage(err) };
      }

    case "set_config":
      try {
        const updates: Record<string, unknown> = {};
        if (request.defaultProfile !== undefined) updates.defaultProfile = request.defaultProfile;
        if (request.closeSourceTab !== undefined) updates.closeSourceTab = request.closeSourceTab;
        await writeConfig(updates);
        return { success: true };
      } catch (err) {
        return { success: false, error: errorMessage(err) };
      }

    default:
      return { success: false, error: "Unknown action" };
  }
}

async function main(): Promise<void> {
  try {
    const message = await readMessage();
    const response = await handleMessage(message);
    await writeMessage(response);
  } catch (err) {
    await writeMessage({
      success: false,
      error: errorMessage(err),
    });
  }
}

main().catch(() => process.exit(1));
