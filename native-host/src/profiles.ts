import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { PROFILE_DIR_PATTERN, type ProfileInfo } from "./schema.js";

function getChromeUserDataDir(): string {
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Google", "Chrome");
    case "win32":
      return join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Google", "Chrome", "User Data");
    case "linux":
      return join(home, ".config", "google-chrome");
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }
}

function getLocalStatePath(): string {
  return join(getChromeUserDataDir(), "Local State");
}

interface LocalStateProfileInfo {
  name?: string;
  gaia_name?: string;
  avatar_icon?: string;
  user_name?: string;
}

export async function discoverProfiles(): Promise<ProfileInfo[]> {
  const localStatePath = getLocalStatePath();

  let raw: string;
  try {
    raw = await readFile(localStatePath, "utf-8");
  } catch {
    throw new Error(`Cannot read Chrome Local State at: ${localStatePath}`);
  }

  let localState: Record<string, unknown>;
  try {
    localState = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse Chrome Local State JSON");
  }

  const profileSection = localState.profile as Record<string, unknown> | undefined;
  const infoCache = profileSection?.info_cache as Record<string, LocalStateProfileInfo> | undefined;

  if (!infoCache) {
    throw new Error("No profile.info_cache found in Local State");
  }

  return Object.entries(infoCache)
    .filter(([directory]) => directory.length > 0 && PROFILE_DIR_PATTERN.test(directory))
    .map(([directory, info]) => ({
      directory,
      name: (info.name || info.gaia_name || directory).slice(0, 200),
      email: info.user_name?.slice(0, 200),
      avatar: info.avatar_icon?.slice(0, 500),
    }));
}
