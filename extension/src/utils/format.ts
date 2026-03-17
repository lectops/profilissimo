import type { ProfileInfo } from "../types/messages.js";

export function profileLabel(profile: ProfileInfo): string {
  return profile.email ? `${profile.name} (${profile.email})` : profile.name;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}
