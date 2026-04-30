import type { ProfileInfo } from "../types/messages.js";
import { CWS_LISTING_URL } from "./constants.js";

const PROFILE_COLORS = [
  "#1a73e8", "#e8710a", "#d93025", "#188038",
  "#a142f4", "#e37400", "#129eaf", "#9334e6",
] as const;

const DEFAULT_LAUNCH_INTERVAL_MS = 200;

export type RowKind = "current" | "installable";

export interface RowEntry {
  profile: ProfileInfo;
  kind: RowKind;
  statusEl: HTMLSpanElement;
}

export type RowVariant = "" | "opening" | "opened" | "failed";

export interface InstallableProfilesResult {
  all: ProfileInfo[];
  installable: ProfileInfo[];
  current: ProfileInfo | null;
  currentEmail: string | null;
}

async function getCurrentProfileEmail(): Promise<string | null> {
  try {
    const info = await chrome.identity.getProfileUserInfo({
      accountStatus: "ANY" as chrome.identity.AccountStatus,
    });
    return info.email || null;
  } catch {
    return null;
  }
}

export async function fetchInstallableProfiles(): Promise<InstallableProfilesResult | null> {
  let response: { success?: boolean; profiles?: ProfileInfo[] } | undefined;
  try {
    response = await chrome.runtime.sendMessage({
      type: "get_profiles",
      forceRefresh: true,
    });
  } catch {
    return null;
  }
  if (!response?.success || !Array.isArray(response.profiles)) return null;

  const all = response.profiles;
  const currentEmail = await getCurrentProfileEmail();
  const current = currentEmail
    ? all.find((p) => p.email === currentEmail) ?? null
    : null;
  const installable = all.filter((p) => !(currentEmail && p.email === currentEmail));

  return { all, installable, current, currentEmail };
}

export interface RenderOptions {
  container: HTMLUListElement;
  installable: ProfileInfo[];
  current?: ProfileInfo | null;
  showCurrentRow?: boolean;
}

export function renderInstallList(opts: RenderOptions): RowEntry[] {
  const { container, installable, current, showCurrentRow = true } = opts;
  container.replaceChildren();

  const entries: RowEntry[] = [];
  let colorIndex = 0;

  if (showCurrentRow && current) {
    container.appendChild(
      buildRow(current, colorIndex++, "current", entries),
    );
  }

  for (const profile of installable) {
    container.appendChild(
      buildRow(profile, colorIndex++, "installable", entries),
    );
  }

  return entries;
}

function buildRow(
  profile: ProfileInfo,
  colorIndex: number,
  kind: RowKind,
  entries: RowEntry[],
): HTMLLIElement {
  const li = document.createElement("li");
  li.className =
    kind === "current" ? "profile-install-row current" : "profile-install-row";

  const avatar = document.createElement("div");
  avatar.className = "profile-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.style.backgroundColor =
    PROFILE_COLORS[colorIndex % PROFILE_COLORS.length];
  avatar.textContent = profile.name.charAt(0).toUpperCase();

  const info = document.createElement("div");
  info.className = "profile-info";

  const name = document.createElement("span");
  name.className = "profile-info-name";
  name.textContent = profile.name;
  info.appendChild(name);

  if (profile.email) {
    const email = document.createElement("span");
    email.className = "profile-info-email";
    email.textContent = profile.email;
    info.appendChild(email);
  }

  const status = document.createElement("span");
  status.className = "row-status";
  status.textContent = kind === "current" ? "✓ this profile" : "";

  li.appendChild(avatar);
  li.appendChild(info);
  li.appendChild(status);

  entries.push({ profile, kind, statusEl: status });
  return li;
}

export function setRowStatus(
  entry: RowEntry,
  label: string,
  variant: RowVariant,
): void {
  entry.statusEl.textContent = label;
  entry.statusEl.className = variant ? `row-status ${variant}` : "row-status";
}

async function openProfileInWebStore(profile: ProfileInfo): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "transfer",
      url: CWS_LISTING_URL,
      targetProfile: profile.directory,
    });
    return response ?? { success: false, error: "No response" };
  } catch {
    return { success: false, error: "Could not reach the helper app" };
  }
}

export interface CascadeResult {
  succeeded: number;
  failed: number;
}

export async function openInAllProfiles(
  entries: RowEntry[],
  opts: { intervalMs?: number } = {},
): Promise<CascadeResult> {
  const { intervalMs = DEFAULT_LAUNCH_INTERVAL_MS } = opts;
  const targets = entries.filter((e) => e.kind === "installable");

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const entry = targets[i];
    setRowStatus(entry, "opening…", "opening");
    const result = await openProfileInWebStore(entry.profile);
    if (result.success) {
      setRowStatus(entry, "✓ Web Store opened", "opened");
      succeeded++;
    } else {
      setRowStatus(entry, result.error ?? "failed", "failed");
      failed++;
    }
    if (i < targets.length - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return { succeeded, failed };
}

export function summarizeCascade(
  result: CascadeResult,
): { tone: "success" | "error"; text: string; buttonLabel: string } {
  const { succeeded, failed } = result;
  if (failed === 0) {
    return {
      tone: "success",
      text: `Web Store opened in ${succeeded} profile${succeeded === 1 ? "" : "s"}. Switch to each window and click Add to Chrome.`,
      buttonLabel: "Open again",
    };
  }
  if (succeeded === 0) {
    return {
      tone: "error",
      text: "Could not open the Web Store. Check that the helper app is still connected.",
      buttonLabel: "Try again",
    };
  }
  return {
    tone: "success",
    text: `Opened in ${succeeded} profile${succeeded === 1 ? "" : "s"}; ${failed} failed. Add to Chrome in the windows that opened, then retry the rest.`,
    buttonLabel: "Try again",
  };
}
