import type { ProfileInfo } from "../types/messages.js";

export function profileLabel(profile: ProfileInfo): string {
  return profile.email ? `${profile.name} (${profile.email})` : profile.name;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

// Editorial-concierge profile palette — same set as the design's PROFILE_PALETTE.
// Indexed deterministically by the profile's position so each profile gets a
// stable accent regardless of which surface is rendering it.
const PROFILE_PALETTE = [
  "#8C6A2A", // brass
  "#2F4F4F", // slate teal
  "#6E2A4A", // burgundy
  "#3A4A2C", // moss
  "#5C3A1F", // walnut
  "#2A3F6E", // ink blue
] as const;

export function profileAccent(index: number): string {
  return PROFILE_PALETTE[index % PROFILE_PALETTE.length];
}

export function profileInitial(profile: ProfileInfo): string {
  return (profile.name || "?").charAt(0).toUpperCase();
}

export function applyChip(el: HTMLElement, profile: ProfileInfo, index: number): void {
  el.classList.add("chip");
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("--chip-accent", profileAccent(index));
  el.textContent = profileInitial(profile);
}
