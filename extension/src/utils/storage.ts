export interface UserPreferences {
  defaultProfile: string | null;
  closeSourceTab: boolean;
  showNotifications: boolean;
}

const DEFAULTS: UserPreferences = {
  defaultProfile: null,
  closeSourceTab: false,
  showNotifications: true,
};

export async function getPreferences(): Promise<UserPreferences> {
  const result = await chrome.storage.sync.get(DEFAULTS);
  return result as UserPreferences;
}

export async function setPreferences(prefs: Partial<UserPreferences>): Promise<void> {
  await chrome.storage.sync.set(prefs);
}

export async function getLastUsedProfile(): Promise<string | null> {
  const result = await chrome.storage.local.get({ lastUsedProfile: null });
  return result.lastUsedProfile as string | null;
}

export async function setLastUsedProfile(profileDir: string): Promise<void> {
  await chrome.storage.local.set({ lastUsedProfile: profileDir });
}
