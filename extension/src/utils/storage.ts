export async function getLastUsedProfile(): Promise<string | null> {
  const result = await chrome.storage.local.get({ lastUsedProfile: null });
  return result.lastUsedProfile as string | null;
}

export async function setLastUsedProfile(profileDir: string): Promise<void> {
  await chrome.storage.local.set({ lastUsedProfile: profileDir });
}
