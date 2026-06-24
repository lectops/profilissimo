import type { PinnedRule, ProfileInfo } from "../types/messages.js";
import { $ } from "../utils/dom.js";
import { applyChip, profileAccent, profileInitial } from "../utils/format.js";
import { hostnameFromUrl } from "../utils/pin-matcher.js";
import { uuid } from "../utils/uuid.js";
import { isAtLeast } from "../utils/version.js";
import { INSTALL_COMMAND, REQUIRED_NMH_VERSION } from "../utils/constants.js";

const profileSection = $("profile-section") as HTMLDivElement;
const profileList = $("profile-list") as HTMLUListElement;
const setupPrompt = $("setup-prompt") as HTMLDivElement;
const loading = $("loading") as HTMLDivElement;
const statusEl = $("status") as HTMLDivElement;
const settingsBtn = $("settings-btn") as HTMLButtonElement;
const refreshBtn = $("refresh-btn") as HTMLButtonElement;
const setupLink = $("setup-link") as HTMLAnchorElement;
const copyInstallBtn = $("copy-install-btn") as HTMLButtonElement;
const pinSection = $("pin-section") as HTMLDivElement;
const pinHostnameEl = $("pin-hostname") as HTMLDivElement;
const pinProfileList = $("pin-profile-list") as HTMLUListElement;
const transferState = $("transfer-state") as HTMLDivElement;
const transferFromChip = $("transfer-from-chip") as HTMLSpanElement;
const transferToChip = $("transfer-to-chip") as HTMLSpanElement;
const transferTargetName = $("transfer-target-name") as HTMLSpanElement;
const currentPageCard = $("current-page-card") as HTMLDivElement;
const currentFavicon = $("current-favicon") as HTMLSpanElement;
const currentUrl = $("current-url") as HTMLSpanElement;

let statusTimeout: ReturnType<typeof setTimeout> | null = null;
let transferring = false;
let currentTabHostname: string | null = null;
let cachedProfiles: ProfileInfo[] = [];
let cachedCurrentEmail: string | null = null;
let cachedPinnedRules: PinnedRule[] = [];

function showStatus(message: string, type: "success" | "error"): void {
  if (statusTimeout) clearTimeout(statusTimeout);
  statusEl.textContent = message;
  statusEl.className = `popup__status ${type}`;
  statusTimeout = setTimeout(() => statusEl.classList.add("hidden"), 2500);
}

function setCurrentPageCard(url: string | undefined, faviconUrl: string | undefined): void {
  if (!url) {
    currentPageCard.classList.add("hidden");
    return;
  }
  let display: string;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      display = u.hostname + (u.pathname === "/" ? "" : u.pathname);
    } else {
      display = url;
    }
  } catch {
    display = url;
  }

  currentUrl.textContent = display;
  currentFavicon.style.backgroundImage = "";
  currentFavicon.textContent = "";

  if (faviconUrl) {
    currentFavicon.style.backgroundImage = `url(${JSON.stringify(faviconUrl)})`;
  } else {
    // Letter fallback — first char of hostname
    const first = display.replace(/^https?:\/\//, "").charAt(0).toUpperCase();
    currentFavicon.textContent = first || "·";
  }
  currentPageCard.classList.remove("hidden");
}

function createNewWindowButton(profile: ProfileInfo): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "profile-row__new-window";
  btn.setAttribute("aria-label", `Open new window in ${profile.name}`);
  btn.title = `New window in ${profile.name}`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "2.5");
  rect.setAttribute("y", "2.5");
  rect.setAttribute("width", "11");
  rect.setAttribute("height", "11");
  rect.setAttribute("rx", "2.5");
  rect.setAttribute("stroke", "currentColor");
  rect.setAttribute("stroke-width", "1.25");

  const plus = document.createElementNS("http://www.w3.org/2000/svg", "path");
  plus.setAttribute("d", "M8 5.5v5M5.5 8h5");
  plus.setAttribute("stroke", "currentColor");
  plus.setAttribute("stroke-width", "1.25");
  plus.setAttribute("stroke-linecap", "round");

  svg.appendChild(rect);
  svg.appendChild(plus);
  btn.appendChild(svg);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    void openNewWindowInProfile(profile);
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  });

  return btn;
}

function renderProfiles(profiles: ProfileInfo[], currentEmail: string | null | undefined, nmhUpToDate: boolean): void {
  profileList.replaceChildren();

  profiles.forEach((profile, index) => {
    const isCurrent = !!(currentEmail && profile.email === currentEmail);

    const li = document.createElement("li");
    li.className = isCurrent ? "profile-row profile-row--current" : "profile-row";

    if (!isCurrent) {
      li.setAttribute("role", "button");
      li.tabIndex = 0;
      li.addEventListener("click", () => void transferToProfile(profile, index));
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void transferToProfile(profile, index);
        }
      });
    }

    const chip = document.createElement("span");
    chip.classList.add("profile-row__chip");
    applyChip(chip, profile, index);

    const body = document.createElement("div");
    body.className = "profile-row__body";

    const name = document.createElement("span");
    name.className = "profile-row__name";
    name.textContent = profile.name;
    body.appendChild(name);

    if (profile.email) {
      const email = document.createElement("span");
      email.className = "profile-row__email";
      email.textContent = profile.email;
      body.appendChild(email);
    }

    li.appendChild(chip);
    li.appendChild(body);

    if (isCurrent) {
      const tag = document.createElement("span");
      tag.className = "profile-row__current-tag";
      tag.textContent = "you are here";
      li.appendChild(tag);
    } else {
      const caret = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      caret.setAttribute("width", "14");
      caret.setAttribute("height", "14");
      caret.setAttribute("viewBox", "0 0 14 14");
      caret.setAttribute("fill", "none");
      caret.setAttribute("aria-hidden", "true");
      caret.classList.add("profile-row__caret");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M5 3l4 4-4 4");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.25");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      caret.appendChild(path);
      li.appendChild(caret);
    }

    if (nmhUpToDate) {
      li.appendChild(createNewWindowButton(profile));
    }

    profileList.appendChild(li);
  });
}

function showTransferring(fromIndex: number, toIndex: number, toProfile: ProfileInfo): void {
  const fromIdx = Math.max(fromIndex, 0);
  const fromProfile = cachedProfiles[fromIdx];
  if (fromProfile) {
    transferFromChip.style.setProperty("--chip-accent", profileAccent(fromIdx));
    transferFromChip.textContent = profileInitial(fromProfile);
  }

  transferToChip.style.setProperty("--chip-accent", profileAccent(toIndex));
  transferToChip.textContent = profileInitial(toProfile);
  // Re-create halo span (cleared by textContent)
  const halo = document.createElement("span");
  halo.className = "popup__transfer-halo";
  halo.setAttribute("aria-hidden", "true");
  transferToChip.appendChild(halo);
  transferTargetName.textContent = toProfile.name;

  profileSection.classList.add("hidden");
  pinSection.classList.add("hidden");
  currentPageCard.classList.add("hidden");
  transferState.classList.remove("hidden");
}

function getCurrentIndex(): number {
  if (!cachedCurrentEmail) return 0;
  const idx = cachedProfiles.findIndex((p) => p.email === cachedCurrentEmail);
  return idx === -1 ? 0 : idx;
}

async function transferToProfile(profile: ProfileInfo, targetIndex: number): Promise<void> {
  if (transferring) return;
  transferring = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  showTransferring(getCurrentIndex(), targetIndex, profile);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "transfer",
      url: tab?.url,
      targetProfile: profile.directory,
      sourceTabId: tab?.id,
    });

    if (response?.success) {
      // Close shortly after the transferring animation has been seen
      setTimeout(() => window.close(), 700);
    } else {
      transferState.classList.add("hidden");
      profileSection.classList.remove("hidden");
      showStatus(response?.error ?? "Transfer failed", "error");
    }
  } catch {
    transferState.classList.add("hidden");
    profileSection.classList.remove("hidden");
    showStatus("Transfer failed", "error");
  } finally {
    transferring = false;
  }
}

async function openNewWindowInProfile(profile: ProfileInfo): Promise<void> {
  if (transferring) return;
  transferring = true;

  try {
    // No `url` and no `sourceTabId`: the service worker routes this to the NMH
    // open_profile action, which opens a fresh window in the target profile.
    // We are not moving or closing any tab.
    const response = await chrome.runtime.sendMessage({
      type: "transfer",
      targetProfile: profile.directory,
    });

    if (response?.success) {
      showStatus(`Opening new window in ${profile.name}`, "success");
      setTimeout(() => window.close(), 700);
    } else {
      showStatus(response?.error ?? "Couldn't open a new window", "error");
    }
  } catch {
    showStatus("Couldn't open a new window", "error");
  } finally {
    transferring = false;
  }
}

async function loadProfiles(forceRefresh = false): Promise<void> {
  loading.classList.remove("hidden");
  profileList.replaceChildren();
  setupPrompt.classList.add("hidden");
  pinSection.classList.add("hidden");
  profileSection.classList.add("hidden");
  currentPageCard.classList.add("hidden");

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
      renderProfiles(response.profiles, currentEmail, nmhUpToDate);
      profileSection.classList.remove("hidden");

      // Current page card
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setCurrentPageCard(tab?.url, tab?.favIconUrl);

      if (nmhUpToDate) {
        await maybeShowPinSection(tab);
      }
    } else {
      showStatus(response?.error ?? "Failed to load profiles", "error");
    }
  } catch {
    loading.classList.add("hidden");
    showStatus("Failed to connect to extension", "error");
  }
}

async function maybeShowPinSection(activeTab?: chrome.tabs.Tab): Promise<void> {
  // The pin picker is shown whenever:
  //   1. Profiles loaded
  //   2. Active tab's URL is a real http(s) page with a hostname
  // The urlPinningEnabled toggle in Settings only gates *auto-redirect* — the
  // popup affordance to pin a site to a profile is always available, so
  // users can discover the feature without flipping a setting first.
  let configResponse: { success?: boolean; config?: { urlPinningEnabled?: boolean; pinnedRules?: PinnedRule[] } } | undefined;
  try {
    configResponse = await chrome.runtime.sendMessage({ type: "get_config" });
  } catch {
    return;
  }
  if (!configResponse?.success) return;

  cachedPinnedRules = Array.isArray(configResponse.config?.pinnedRules) ? configResponse.config!.pinnedRules! : [];
  const autoRedirectOn = configResponse.config?.urlPinningEnabled === true;

  if (cachedProfiles.length === 0) return;

  const tab = activeTab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const hostname = tab?.url ? hostnameFromUrl(tab.url) : null;
  if (!hostname) return;

  currentTabHostname = hostname;
  const existingRule = cachedPinnedRules.find((r) => r.pattern === hostname);

  pinHostnameEl.textContent = hostname;
  renderPinPicker(cachedProfiles, existingRule);
  setAutoRedirectNote(autoRedirectOn);
  pinSection.classList.remove("hidden");
}

function setAutoRedirectNote(enabled: boolean): void {
  const note = document.getElementById("pin-auto-note");
  if (!note) return;
  if (enabled) {
    note.classList.add("hidden");
  } else {
    note.classList.remove("hidden");
  }
}

function getCurrentDirectoryFromCache(): string | null {
  if (!cachedCurrentEmail) return null;
  const match = cachedProfiles.find((p) => p.email === cachedCurrentEmail);
  return match?.directory ?? null;
}

function renderPinPicker(profiles: ProfileInfo[], existing: PinnedRule | undefined): void {
  pinProfileList.replaceChildren();

  const currentDir = getCurrentDirectoryFromCache();

  profiles.forEach((profile, index) => {
    const isCurrent = profile.directory === currentDir;
    // Match the existing pin by account email when available (survives
    // directory drift), falling back to the stored directory.
    const isSelected = !!(existing && (existing.targetProfileEmail
      ? existing.targetProfileEmail === profile.email
      : existing.targetProfileDirectory === profile.directory));

    const li = document.createElement("li");
    li.className = isSelected ? "pin-row pin-row--selected" : "pin-row";
    li.setAttribute("role", "button");
    li.tabIndex = 0;

    const chip = document.createElement("span");
    chip.classList.add("pin-row__chip");
    applyChip(chip, profile, index);

    const name = document.createElement("span");
    name.className = "pin-row__name";
    name.textContent = isCurrent ? `${profile.name} · here` : profile.name;

    li.appendChild(chip);
    li.appendChild(name);

    if (isSelected) {
      const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      check.setAttribute("width", "14");
      check.setAttribute("height", "14");
      check.setAttribute("viewBox", "0 0 16 16");
      check.setAttribute("fill", "none");
      check.setAttribute("stroke", "currentColor");
      check.setAttribute("stroke-width", "1.5");
      check.setAttribute("aria-hidden", "true");
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M3 8l3.5 3.5L13 5");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      check.appendChild(p);
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
  });

  if (existing) {
    const li = document.createElement("li");
    li.className = "pin-row pin-row--remove";
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
  const targetEmail = cachedProfiles.find((p) => p.directory === targetDir)?.email;
  const filtered = cachedPinnedRules.filter((r) => r.pattern !== currentTabHostname);
  const updated: PinnedRule[] = [
    ...filtered,
    {
      id: uuid(),
      pattern: currentTabHostname,
      targetProfileDirectory: targetDir,
      ...(targetEmail ? { targetProfileEmail: targetEmail } : {}),
      createdAt: Date.now(),
    },
  ];
  try {
    const response = await chrome.runtime.sendMessage({ type: "set_config", pinnedRules: updated });
    if (!response?.success) {
      showStatus("Failed to save pin", "error");
      return;
    }
    const target = cachedProfiles.find((p) => p.directory === targetDir);
    const targetLabel = target ? target.name : targetDir;
    const currentDir = getCurrentDirectoryFromCache();

    // Pin + go: if target is a different profile, transfer the URL there now.
    if (currentDir && currentDir !== targetDir) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      void chrome.runtime.sendMessage({
        type: "transfer",
        url: tab?.url,
        targetProfile: targetDir,
        sourceTabId: tab?.id,
      });
      showStatus(`Pinned and opened in ${targetLabel}`, "success");
    } else {
      showStatus(`Pinned to ${targetLabel}`, "success");
    }
    setTimeout(() => window.close(), 800);
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
      cachedPinnedRules = updated;
      renderPinPicker(cachedProfiles, undefined);
      showStatus(`Unpinned ${currentTabHostname}`, "success");
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
      copyInstallBtn.textContent = "Copy";
    }, 1500);
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
  }
});

setupLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
});

refreshBtn.addEventListener("click", () => void loadProfiles(true));

document.getElementById("pin-enable-auto")?.addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const response = await chrome.runtime.sendMessage({ type: "set_config", urlPinningEnabled: true });
    if (response?.success) {
      setAutoRedirectNote(true);
      showStatus("Auto-redirect turned on.", "success");
    } else {
      showStatus("Couldn't turn on auto-redirect.", "error");
    }
  } catch {
    showStatus("Couldn't turn on auto-redirect.", "error");
  }
});

void loadProfiles();
