import { spawn } from "node:child_process";
import { platform } from "node:os";
import { access, constants } from "node:fs/promises";
import { join } from "node:path";

function getChromePaths(): string[] {
  switch (platform()) {
    case "darwin":
      return [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      ];
    case "win32": {
      const paths: string[] = [];
      const envVars = [
        process.env.PROGRAMFILES,
        process.env["PROGRAMFILES(X86)"],
        process.env.LOCALAPPDATA,
      ];
      for (const dir of envVars) {
        if (dir) {
          paths.push(join(dir, "Google", "Chrome", "Application", "chrome.exe"));
        }
      }
      return paths;
    }
    case "linux":
      return [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
      ];
    default:
      return [];
  }
}

async function findChrome(): Promise<string> {
  for (const chromePath of getChromePaths()) {
    try {
      await access(chromePath, constants.X_OK);
      return chromePath;
    } catch {
      continue;
    }
  }
  throw new Error("Chrome executable not found");
}

const SPAWN_TIMEOUT_MS = 5_000;

export async function launchInProfile(url: string, profileDirectory: string): Promise<void> {
  const chromePath = await findChrome();

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Timed out waiting for Chrome to spawn"));
      }
    }, SPAWN_TIMEOUT_MS);

    const child = spawn(
      chromePath,
      [`--profile-directory=${profileDirectory}`, "--", url],
      { detached: true, stdio: "ignore" },
    );

    child.once("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to launch Chrome: ${err.message}`));
      }
    });

    child.once("spawn", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        child.unref();
        resolve();
      }
    });
  });
}
