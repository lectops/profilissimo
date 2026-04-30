import { listProfiles } from "./native-messaging.js";

// Identifies which Chrome profile directory is hosting THIS extension instance.
// Chrome doesn't expose this directly, so we triangulate: getProfileUserInfo()
// gives the email of the signed-in account, and list_profiles (via NMH) maps
// emails to directories. The result is cached in chrome.storage.local so it
// survives service-worker restarts without re-querying NMH.

const STORAGE_KEY = "currentProfileDirectory";

let memoCache: string | null | undefined; // undefined = not yet attempted

async function getCurrentEmail(): Promise<string | null> {
  try {
    const info = await chrome.identity.getProfileUserInfo({
      accountStatus: "ANY" as chrome.identity.AccountStatus,
    });
    return info.email || null;
  } catch {
    return null;
  }
}

async function readPersisted(): Promise<string | null> {
  const result = await chrome.storage.local.get({ [STORAGE_KEY]: null });
  const value = result[STORAGE_KEY];
  return typeof value === "string" ? value : null;
}

async function writePersisted(directory: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: directory });
}

async function resolveFromNmh(): Promise<string | null> {
  const email = await getCurrentEmail();
  if (!email) return null;
  try {
    const response = await listProfiles();
    if (!response.success || !response.profiles) return null;
    const match = response.profiles.find((p) => p.email === email);
    return match?.directory ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentProfileDirectory(): Promise<string | null> {
  if (memoCache !== undefined) return memoCache;

  const persisted = await readPersisted();
  if (persisted) {
    memoCache = persisted;
    return persisted;
  }

  const resolved = await resolveFromNmh();
  if (resolved) {
    await writePersisted(resolved);
  }
  memoCache = resolved;
  return resolved;
}

// Force re-resolution. Use when profiles are added/removed or after a possible
// account change.
export async function refreshCurrentProfileDirectory(): Promise<string | null> {
  memoCache = undefined;
  const resolved = await resolveFromNmh();
  if (resolved) {
    await writePersisted(resolved);
  } else {
    await chrome.storage.local.remove(STORAGE_KEY);
  }
  memoCache = resolved;
  return resolved;
}
