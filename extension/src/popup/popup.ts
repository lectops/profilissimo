import type { PinnedRule, ProfileInfo } from "../types/messages.js";
import { $ } from "../utils/dom.js";
import { profileLabel } from "../utils/format.js";
import { hostnameFromUrl } from "../utils/pin-matcher.js";
import { uuid } from "../utils/uuid.js";
import { isAtLeast } from "../utils/version.js";
import { INSTALL_COMMAND, REQUIRED_NMH_VERSION } from "../utils/constants.js";

const profileList = $("profile-list") as HTMLUListElement;
const setupPrompt = $("setup-prompt") as HTMLDivElement;
const loading = $("loading") as HTMLDivElement;
const statusEl = $("status") as HTMLDivElement;
const settingsBtn = $("settings-btn") as HTMLButtonElement;
const refreshBtn = $("refresh-btn") as HTMLButtonElement;
const setupLink = $("setup-link") as HTMLAnchorElement;
const copyInstallBtn = $("copy-install-btn") as HTMLButtonElement;
const pinSection = $("pin-section") as HTMLDivElement;
const pinToggle = $("pin-toggle") as HTMLButtonElement;
const pinToggleLabel = $("pin-toggle-label") as HTMLSpanElement;
const pinPicker = $("pin-picker") as HTMLDivElement;
const pinHostnameEl = $("pin-hostname") as HTMLSpanElement;
const pinProfileList = $("pin-profile-list") as HTMLUListElement;

const PROFILE_COLORS = [
  "#1a73e8", "#e8710a", "#d93025", "#188038",
  "#a142f4", "#e37400", "#129eaf", "#9334e6",
] as const;

function getProfileColor(index: number): string {
  return PROFILE_COLORS[index % PROFILE_COLORS.length];
}

let statusTimeout: ReturnType<typeof setTimeout> | null = null;
let transferring = false;
let currentTabHostname: string | null = null;
let cachedProfiles: ProfileInfo[] = [];
let cachedCurrentEmail: string | null = null;
let cachedPinnedRules: PinnedRule[] = [];

function showStatus(message: string, type: "success" | "error"): void {
  if (statusTimeout) clearTimeout(statusTimeout);
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusTimeout = setTimeout(() => statusEl.classList.add("hidden"), 2500);
}

function renderProfiles(profiles: ProfileInfo[], currentEmail?: string | null): void {
  profileList.replaceChildren();

  profiles.forEach((profile, index) => {
    const isCurrent = !!(currentEmail && profile.email === currentEmail);

    const li = document.createElement("li");
    li.className = isCurrent ? "profile-item current" : "profile-item";

    if (!isCurrent) {
      li.setAttribute("role", "button");
      li.tabIndex = 0;
      li.addEventListener("click", () => void transferToProfile(profile));
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void transferToProfile(profile);
        }
      });
    }

    const colorDot = document.createElement("div");
    colorDot.className = "profile-color";
    colorDot.setAttribute("aria-hidden", "true");
    colorDot.style.backgroundColor = getProfileColor(index);
    colorDot.textContent = profile.name.charAt(0).toUpperCase();

    const name = document.createElement("span");
    name.className = "profile-name";
    name.textContent = profileLabel(profile);

    li.appendChild(colorDot);
    li.appendChild(name);

    if (isCurrent) {
      const badge = document.createElement("span");
      badge.className = "current-badge";
      badge.textContent = "current";
      li.appendChild(badge);
    }

    profileList.appendChild(li);
  });
}

async function transferToProfile(profile: ProfileInfo): Promise<void> {
  if (transferring) return;
  transferring = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const response = await chrome.runtime.sendMessage({
      type: "transfer",
      url: tab?.url,
      targetProfile: profile.directory,
      sourceTabId: tab?.id,
    });

    if (response?.success) {
      showStatus(`Opened in ${profileLabel(profile)}`, "success");
    } else {
      showStatus(response?.error ?? "Transfer failed", "error");
    }
  } catch {
    showStatus("Transfer failed", "error");
  } finally {
    transferring = false;
  }
}

async function loadProfiles(forceRefresh = false): Promise<void> {
  loading.classList.remove("hidden");
  profileList.replaceChildren();
  setupPrompt.classList.add("hidden");
  pinSection.classList.add("hidden");

  try {
    const healthResponse = await chrome.runtime.sendMessage({ type: "health_check" });

    if (!healthResponse?.connected) {
      loading.classList.add("hidden");
      setupPrompt.classList.remove("hidden");
      return;
    }

    const nmhUpToDate = isAtLeast(healthResponse.version, REQUIRED_NMH_VERSION);

    const response = await chrome.runtime.sendMessage({
      type: "get_profiles",
      forceRefresh,
    });

    loading.classList.add("hidden");

    if (response?.success && response.profiles) {
      let currentEmail: string | null = null;
      try {
        const info = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" as chrome.identity.AccountStatus });
        currentEmail = info.email || null;
      } catch {
        // identity API not available
      }
      cachedProfiles = response.profiles;
      cachedCurrentEmail = currentEmail;
      renderProfiles(response.profiles, currentEmail);

      if (nmhUpToDate) {
        await maybeShowPinSection();
      }
    } else {
      showStatus(response?.error ?? "Failed to load profiles", "error");
    }
  } catch {
    loading.classList.add("hidden");
    showStatus("Failed to connect to extension", "error");
  }
}

async function maybeShowPinSection(): Promise<void> {
  // Pinning is gated on:
  //   1. Feature flag on (matches right-click submenu behavior)
  //   2. At least one non-current profile to pin to
  //   3. Active tab's URL is a real http(s) page with a hostname
  let configResponse: { success?: boolean; config?: { urlPinningEnabled?: boolean; pinnedRules?: PinnedRule[] } } | undefined;
  try {
    configResponse = await chrome.runtime.sendMessage({ type: "get_config" });
  } catch {
    return;
  }
  if (!configResponse?.success || configResponse.config?.urlPinningEnabled !== true) return;

  cachedPinnedRules = Array.isArray(configResponse.config.pinnedRules) ? configResponse.config.pinnedRules : [];

  const otherProfiles = cachedProfiles.filter((p) => !cachedCurrentEmail || p.email !== cachedCurrentEmail);
  if (otherProfiles.length === 0) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = tab?.url ? hostnameFromUrl(tab.url) : null;
  if (!hostname) return;

  currentTabHostname = hostname;
  const existingRule = cachedPinnedRules.find((r) => r.pattern === hostname);

  if (existingRule) {
    const target = cachedProfiles.find((p) => p.directory === existingRule.targetProfileDirectory);
    pinToggleLabel.textContent = target
      ? `Pinned to ${profileLabel(target)} — change…`
      : "Pinned (target unavailable) — change…";
  } else {
    pinToggleLabel.textContent = "Always open this site in…";
  }

  pinHostnameEl.textContent = hostname;
  renderPinPicker(otherProfiles, existingRule);
  pinSection.classList.remove("hidden");
  pinPicker.classList.add("hidden");
}

function renderPinPicker(profiles: ProfileInfo[], existing: PinnedRule | undefined): void {
  pinProfileList.replaceChildren();

  for (const profile of profiles) {
    const li = document.createElement("li");
    li.className = "pin-profile-item";
    li.setAttribute("role", "button");
    li.tabIndex = 0;

    const name = document.createElement("span");
    name.className = "pin-profile-name";
    name.textContent = profileLabel(profile);
    li.appendChild(name);

    if (existing && existing.targetProfileDirectory === profile.directory) {
      const check = document.createElement("span");
      check.className = "pin-profile-check";
      check.textContent = "✓";
      li.appendChild(check);
    }

    const handler = () => void savePin(profile.directory);
    li.addEventListener("click", handler);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });

    pinProfileList.appendChild(li);
  }

  if (existing) {
    const li = document.createElement("li");
    li.className = "pin-profile-item pin-profile-remove";
    li.setAttribute("role", "button");
    li.tabIndex = 0;
    li.textContent = "Remove pin";
    const handler = () => void removePin();
    li.addEventListener("click", handler);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
    pinProfileList.appendChild(li);
  }
}

async function savePin(targetDir: string): Promise<void> {
  if (!currentTabHostname) return;
  const filtered = cachedPinnedRules.filter((r) => r.pattern !== currentTabHostname);
  const updated: PinnedRule[] = [
    ...filtered,
    {
      id: uuid(),
      pattern: currentTabHostname,
      targetProfileDirectory: targetDir,
      createdAt: Date.now(),
    },
  ];
  try {
    const response = await chrome.runtime.sendMessage({ type: "set_config", pinnedRules: updated });
    if (response?.success) {
      const target = cachedProfiles.find((p) => p.directory === targetDir);
      showStatus(`Pinned ${currentTabHostname} to ${target ? profileLabel(target) : targetDir}`, "success");
      setTimeout(() => window.close(), 800);
    } else {
      showStatus("Failed to save pin", "error");
    }
  } catch {
    showStatus("Failed to save pin", "error");
  }
}

async function removePin(): Promise<void> {
  if (!currentTabHostname) return;
  const updated = cachedPinnedRules.filter((r) => r.pattern !== currentTabHostname);
  try {
    const response = await chrome.runtime.sendMessage({ type: "set_config", pinnedRules: updated });
    if (response?.success) {
      showStatus(`Removed pin for ${currentTabHostname}`, "success");
      setTimeout(() => window.close(), 800);
    } else {
      showStatus("Failed to remove pin", "error");
    }
  } catch {
    showStatus("Failed to remove pin", "error");
  }
}

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

copyInstallBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    copyInstallBtn.textContent = "Copied!";
    setTimeout(() => {
      copyInstallBtn.textContent = "Copy install command";
    }, 1500);
  } catch {
    // Fallback: open onboarding page
    chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
  }
});

setupLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
});

refreshBtn.addEventListener("click", () => void loadProfiles(true));

pinToggle.addEventListener("click", () => {
  pinPicker.classList.toggle("hidden");
});

void loadProfiles();
