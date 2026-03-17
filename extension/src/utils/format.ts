import type { ProfileInfo } from "../types/messages.js";

export function profileLabel(profile: ProfileInfo): string {
  const firstName = profile.name.split(" ")[0];
  return profile.email ? `${firstName} (${profile.email})` : profile.name;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
