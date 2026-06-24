import type { PinnedRule, ProfileInfo } from "../types/messages.js";
import { $ } from "../utils/dom.js";
import { applyChip, profileAccent, profileInitial } from "../utils/format.js";
import { hostnameFromUrl } from "../utils/pin-matcher.js";
import { uuid } from "../utils/uuid.js";
import { isAtLeast } from "../utils/version.js";
import { INSTALL_COMMAND, REQUIRED_NMH_VERSION } from "../utils/constants.js";
import { renderHelperStatus } from "../shared/helper-status.js";

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const setupPrompt    = $("setup-prompt")          as HTMLDivElement;
const setupStatusMount = $("setup-status-mount")  as HTMLDivElement;
const setupCmdText   = $("setup-cmd-text")        as HTMLSpanElement;
const copyInstallBtn = $("copy-install-btn")       as HTMLButtonElement;
const setupLink      = $("setup-link")             as HTMLAnchorElement;

const loadingEl      = $("loading")               as HTMLDivElement;

const transferState      = $("transfer-state")        as HTMLDivElement;
const transferFromChip   = $("transfer-from-chip")    as HTMLSpanElement;
const transferToChip     = $("transfer-to-chip")      as HTMLSpanElement;
const transferTargetName = $("transfer-target-name")  as HTMLSpanElement;

const listState          = $("list-state")            as HTMLDivElement;
const currentChip        = $("current-chip")          as HTMLSpanElement;
const currentName        = $("current-name")          as HTMLSpanElement;
const pinHereBtn         = $("pin-here-btn")          as HTMLButtonElement;
const currentPageCard    = $("current-page-card")     as HTMLDivElement;
const currentFavicon     = $("current-favicon")       as HTMLSpanElement;
const currentUrl         = $("current-url")           as HTMLSpanElement;
const helperOutdatedBanner = $("helper-outdated-banner") as HTMLDivElement;
const outdatedUpdateLink = $("outdated-update-link")  as HTMLAnchorElement;
const profileList        = $("profile-list")          as HTMLUListElement;
const noTargets          = $("no-targets")            as HTMLDivElement;
const iconLegend         = $("icon-legend")           as HTMLDivElement;
const setupOtherBtn      = $("setup-other-btn")       as HTMLButtonElement;

const settingsBtn   = $("settings-btn")           as HTMLButtonElement;
const refreshBtn    = $("refresh-btn")            as HTMLButtonElement;

const toastEl       = $("toast")                  as HTMLDivElement;

// ─── State ────────────────────────────────────────────────────────────────────

let toastTimeout: ReturnType<typeof setTimeout> | null = null;
let transferring = false;
let currentTabHostname: string | null = null;
let cachedProfiles: ProfileInfo[] = [];
let cachedCurrentEmail: string | null = null;
let cachedPinnedRules: PinnedRule[] = [];
let cachedUrlPinningEnabled = false;

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message: string, type: "success" | "error"): void {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastEl.textContent = message;
  toastEl.className = `popup__toast popup__toast--${type}`;
  toastToastTimeout();
}

function toastToastTimeout(): void {
  toastTimeout = setTimeout(() => {
    toastEl.className = "popup__toast hidden";
    toastEl.textContent = "";
  }, 3200);
}

// ─── State transitions ────────────────────────────────────────────────────────

function showSetup(): void {
  setupPrompt.classList.remove("hidden");
  loadingEl.classList.add("hidden");
  transferState.classList.add("hidden");
  listState.classList.add("hidden");
}

function showLoading(): void {
  loadingEl.classList.remove("hidden");
  setupPrompt.classList.add("hidden");
  transferState.classList.add("hidden");
  listState.classList.add("hidden");
}

function showList(): void {
  listState.classList.remove("hidden");
  loadingEl.classList.add("hidden");
  setupPrompt.classList.add("hidden");
  // transferState hidden separately when transfer finishes
}

function showTransferring(fromIndex: number, toIndex: number, toProfile: ProfileInfo): void {
  const fromProfile = cachedProfiles[Math.max(fromIndex, 0)];
  if (fromProfile) {
    transferFromChip.style.setProperty("--chip-accent", profileAccent(fromIndex));
    transferFromChip.textContent = profileInitial(fromProfile);
  }

  transferToChip.style.setProperty("--chip-accent", profileAccent(toIndex));
  transferToChip.textContent = profileInitial(toProfile);
  // Re-create halo span (cleared by textContent assignment)
  const halo = document.createElement("span");
  halo.className = "popup__transfer-halo";
  halo.setAttribute("aria-hidden", "true");
  transferToChip.appendChild(halo);
  transferTargetName.textContent = toProfile.name;

  listState.classList.add("hidden");
  transferState.classList.remove("hidden");
}

// ─── Current page card ────────────────────────────────────────────────────────

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
    const first = display.replace(/^https?:\/\//, "").charAt(0).toUpperCase();
    currentFavicon.textContent = first || "·";
  }
  currentPageCard.classList.remove("hidden");
}

// ─── Current profile strip ────────────────────────────────────────────────────

function setCurrentStrip(profile: ProfileInfo, index: number): void {
  currentChip.style.setProperty("--chip-accent", profileAccent(index));
  currentChip.textContent = profileInitial(profile);
  currentName.textContent = profile.name;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentIndex(): number {
  if (!cachedCurrentEmail) return 0;
  const idx = cachedProfiles.findIndex((p) => p.email === cachedCurrentEmail);
  return idx === -1 ? 0 : idx;
}

function getCurrentDirectoryFromCache(): string | null {
  if (!cachedCurrentEmail) return null;
  const match = cachedProfiles.find((p) => p.email === cachedCurrentEmail);
  return match?.directory ?? null;
}

// ─── Profile rows ─────────────────────────────────────────────────────────────

function renderProfiles(
  profiles: ProfileInfo[],
  currentEmail: string | null | undefined,
  nmhUpToDate: boolean,
  hostname: string | null,
): void {
  const nonHttp = !hostname;
  const targets = profiles.filter((p) => !(currentEmail && p.email === currentEmail));

  profileList.replaceChildren();

  if (targets.length === 0) {
    noTargets.classList.remove("hidden");
    iconLegend.classList.add("hidden");
    return;
  }

  noTargets.classList.add("hidden");
  iconLegend.classList.remove("hidden");

  targets.forEach((profile, idx) => {
    // The profile's index within the full list (for colour consistency)
    const fullIdx = profiles.indexOf(profile);

    const li = document.createElement("li");
    li.className = "profile-row";

    // ── Left: move body ──────────────────────────────────────────────────────
    const moveDiv = document.createElement("div");
    moveDiv.className = "profile-row__move";
    moveDiv.setAttribute("role", "button");
    moveDiv.tabIndex = 0;
    moveDiv.title = `Move this tab to ${profile.name}`;

    const chip = document.createElement("span");
    chip.className = "chip profile-row__chip";
    applyChip(chip, profile, fullIdx);

    const body = document.createElement("div");
    body.className = "profile-row__body";

    const nameEl = document.createElement("div");
    nameEl.className = "profile-row__name";
    nameEl.textContent = profile.name;
    body.appendChild(nameEl);

    if (profile.email) {
      const emailEl = document.createElement("div");
      emailEl.className = "profile-row__email";
      emailEl.textContent = profile.email;
      body.appendChild(emailEl);
    }

    moveDiv.appendChild(chip);
    moveDiv.appendChild(body);

    const onMove = (): void => {
      void transferToProfile(profile, fullIdx);
    };
    moveDiv.addEventListener("click", onMove);
    moveDiv.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onMove();
      }
    });

    li.appendChild(moveDiv);

    // ── Right: icon buttons ──────────────────────────────────────────────────
    const iconsDiv = document.createElement("div");
    iconsDiv.className = "profile-row__icons";

    // New-window button
    const newWinBtn = document.createElement("button");
    newWinBtn.type = "button";
    newWinBtn.className = "profile-row__icon";
    newWinBtn.setAttribute("aria-label", `Open new window in ${profile.name}`);

    if (!nmhUpToDate) {
      newWinBtn.disabled = true;
      newWinBtn.title = "Update the helper to enable new windows";
    } else {
      newWinBtn.title = `Open a new window in ${profile.name}`;
    }

    newWinBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M12 13.2v3.6M10.2 15h3.6"/></svg>`;

    newWinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!nmhUpToDate) return;
      void openNewWindowInProfile(profile);
    });
    newWinBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") e.stopPropagation();
    });

    // Pin button
    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = "profile-row__icon profile-row__icon--pin";
    pinBtn.setAttribute("aria-label", `Pin this site to ${profile.name}`);

    const pinDisabled = !nmhUpToDate || nonHttp;
    if (pinDisabled) {
      pinBtn.disabled = true;
      if (!nmhUpToDate) {
        pinBtn.title = "Update the helper to enable pinning";
      } else {
        pinBtn.title = "Pinning works on web pages only";
      }
    } else {
      pinBtn.title = `Always open ${hostname} in ${profile.name}`;
    }

    pinBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9.2 3h5.6l-1 6 2.7 2.7a1 1 0 0 1-.7 1.7H8.2a1 1 0 0 1-.7-1.7L10.2 9 9.2 3Z"/></svg>`;

    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pinDisabled) return;
      void savePinWithToast(profile.directory, profile.name);
    });
    pinBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") e.stopPropagation();
    });

    iconsDiv.appendChild(newWinBtn);
    iconsDiv.appendChild(pinBtn);
    li.appendChild(iconsDiv);

    profileList.appendChild(li);
    void idx; // suppress unused warning
  });
}

// ─── Actions ──────────────────────────────────────────────────────────────────

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
      showToast(`Moved this tab to ${profile.name}`, "success");
      setTimeout(() => window.close(), 700);
    } else {
      transferState.classList.add("hidden");
      showList();
      showToast(response?.error ?? "Transfer failed", "error");
    }
  } catch {
    transferState.classList.add("hidden");
    showList();
    showToast("Transfer failed", "error");
  } finally {
    transferring = false;
  }
}

async function openNewWindowInProfile(profile: ProfileInfo): Promise<void> {
  if (transferring) return;
  transferring = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "transfer",
      targetProfile: profile.directory,
    });

    if (response?.success) {
      showToast(`Opened a new window in ${profile.name}`, "success");
      setTimeout(() => window.close(), 700);
    } else {
      showToast(response?.error ?? "Couldn't open a new window", "error");
    }
  } catch {
    showToast("Couldn't open a new window", "error");
  } finally {
    transferring = false;
  }
}

// Save pin from per-row pin button (target = some other profile)
async function savePinWithToast(targetDir: string, targetName: string): Promise<void> {
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
      showToast("Failed to save pin", "error");
      return;
    }
    cachedPinnedRules = updated;

    // Build toast copy per comp
    let msg = `Pinned ${currentTabHostname} → ${targetName}`;
    if (!cachedUrlPinningEnabled) {
      msg += " · auto-redirect is off";
    }
    showToast(msg, "success");

    // Pin + go if target differs from current profile
    const currentDir = getCurrentDirectoryFromCache();
    if (currentDir && currentDir !== targetDir) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      void chrome.runtime.sendMessage({
        type: "transfer",
        url: tab?.url,
        targetProfile: targetDir,
        sourceTabId: tab?.id,
      });
    }
    setTimeout(() => window.close(), 1200);
  } catch {
    showToast("Failed to save pin", "error");
  }
}

// Save pin from "Pin here" pill (target = current profile)
async function savePinToCurrent(): Promise<void> {
  const currentDir = getCurrentDirectoryFromCache();
  if (!currentDir || !currentTabHostname) return;
  const currentProfile = cachedProfiles.find((p) => p.directory === currentDir);
  if (!currentProfile) return;
  await savePinWithToast(currentDir, currentProfile.name);
}

// ─── Load profiles ────────────────────────────────────────────────────────────

async function loadProfiles(forceRefresh = false): Promise<void> {
  showLoading();
  profileList.replaceChildren();
  toastEl.className = "popup__toast hidden";

  try {
    const healthResponse = await chrome.runtime.sendMessage({ type: "health_check" });

    if (!healthResponse?.connected) {
      // Mount compact HelperStatus inside the setup box
      setupStatusMount.replaceChildren(
        renderHelperStatus({ state: "not-installed", variant: "compact" }),
      );
      setupCmdText.textContent = INSTALL_COMMAND;
      showSetup();
      return;
    }

    const nmhUpToDate = isAtLeast(healthResponse.version, REQUIRED_NMH_VERSION);

    const response = await chrome.runtime.sendMessage({ type: "get_profiles", forceRefresh });

    if (!(response?.success && response.profiles)) {
      showList();
      showToast(response?.error ?? "Failed to load profiles", "error");
      return;
    }

    // Resolve current email
    let currentEmail: string | null = null;
    try {
      const info = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" as chrome.identity.AccountStatus });
      currentEmail = info.email || null;
    } catch {
      // identity API not available
    }
    cachedProfiles = response.profiles as ProfileInfo[];
    cachedCurrentEmail = currentEmail;

    // Current profile strip
    const currentProfileObj = currentEmail
      ? cachedProfiles.find((p) => p.email === currentEmail)
      : null;
    const currentIdx = getCurrentIndex();
    if (currentProfileObj) {
      setCurrentStrip(currentProfileObj, currentIdx);
    } else if (cachedProfiles.length > 0) {
      // Fallback: use first profile
      setCurrentStrip(cachedProfiles[0], 0);
    }

    // Current page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setCurrentPageCard(tab?.url, tab?.favIconUrl);

    // Determine hostname
    const hostname = tab?.url ? hostnameFromUrl(tab.url) : null;
    currentTabHostname = hostname;

    // Fetch config for urlPinningEnabled
    let urlPinningEnabled = false;
    try {
      const configResponse = await chrome.runtime.sendMessage({ type: "get_config" });
      if (configResponse?.success) {
        cachedPinnedRules = Array.isArray(configResponse.config?.pinnedRules)
          ? (configResponse.config!.pinnedRules as PinnedRule[])
          : [];
        urlPinningEnabled = configResponse.config?.urlPinningEnabled === true;
      }
    } catch {
      // config unavailable — proceed with defaults
    }
    cachedUrlPinningEnabled = urlPinningEnabled;

    // Outdated banner
    if (!nmhUpToDate) {
      helperOutdatedBanner.classList.remove("hidden");
    } else {
      helperOutdatedBanner.classList.add("hidden");
    }

    // Pin here pill: visible only when helper is current AND page has a hostname
    const canPinCurrent = nmhUpToDate && !!hostname;
    if (canPinCurrent) {
      pinHereBtn.classList.remove("hidden");
      pinHereBtn.title = `Pin ${hostname} to this profile`;
    } else {
      pinHereBtn.classList.add("hidden");
    }

    // Render profiles (excluding current)
    renderProfiles(cachedProfiles, currentEmail, nmhUpToDate, hostname);

    showList();
  } catch {
    showList();
    showToast("Failed to connect to extension", "error");
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refreshBtn.addEventListener("click", () => void loadProfiles(true));

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

pinHereBtn.addEventListener("click", () => {
  void savePinToCurrent();
});

setupOtherBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

outdatedUpdateLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

void loadProfiles();
