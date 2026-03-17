import type { ProfileInfo } from "../types/messages.js";
import { listProfiles } from "./native-messaging.js";

let cachedProfiles: ProfileInfo[] | null = null;
let inflight: Promise<ProfileInfo[]> | null = null;

async function fetchProfiles(): Promise<ProfileInfo[]> {
  const response = await listProfiles();
  if (!response.success || !response.profiles) {
    throw new Error(response.error ?? "Failed to retrieve profiles");
  }
  cachedProfiles = response.profiles;
  return cachedProfiles;
}

export async function getProfiles(forceRefresh = false): Promise<ProfileInfo[]> {
  if (cachedProfiles && !forceRefresh) {
    return cachedProfiles;
  }

  if (inflight && !forceRefresh) {
    return inflight;
  }

  // Capture a reference so the finally block only clears inflight if no
  // subsequent forceRefresh has replaced it.
  const thisRequest = fetchProfiles().finally(() => {
    if (inflight === thisRequest) {
      inflight = null;
    }
  });

  inflight = thisRequest;
  return thisRequest;
}

export function clearProfileCache(): void {
  cachedProfiles = null;
}
