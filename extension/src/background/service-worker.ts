import type { PinnedRule, ProfileInfo } from "../types/messages.js";
import { profileLabel, errorMessage } from "../utils/format.js";
import { healthCheck, openUrlInProfile, openProfile, getConfig, setConfig } from "../utils/native-messaging.js";
import { isTransferableUrl } from "../utils/url.js";
import { getProfiles, clearProfileCache } from "../utils/profiles.js";
import { getLastUsedProfile, setLastUsedProfile } from "../utils/storage.js";
import { isAtLeast } from "../utils/version.js";
import { REQUIRED_NMH_VERSION } from "../utils/constants.js";
import { findMatchingRule, isValidPattern, hostnameFromUrl } from "../utils/pin-matcher.js";
import { getCurrentProfileDirectory, refreshCurrentProfileDirectory } from "../utils/profile-identity.js";
import { uuid } from "../utils/uuid.js";

self.addEventListener("unhandledrejection", (event) => {
  console.error("Profilissimo: unhandled rejection", event.reason);
});

// --- Current profile detection ---

async function getCurrentProfileEmail(): Promise<string | null> {
  try {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" as chrome.identity.AccountStatus });
    return info.email || null;
  } catch {
    return null;
  }
}

// --- URL pinning state ---
//
// Cached in module memory to keep onBeforeNavigate fast. `pinningEnabled` and
// `pinnedRules` mirror NMH config; refreshed on init, after set_config from
// Settings, and lazily if a navigation fires while we're cold (handled by
// init's awaited refresh — the listener no-ops until both are populated).

let pinningEnabled = false;
let pinnedRules: PinnedRule[] = [];

async function refreshPinningState(): Promise<void> {
  try {
    const config = await getConfig();
    pinningEnabled = config.urlPinningEnabled === true;
    pinnedRules = Array.isArray(config.pinnedRules) ? config.pinnedRules : [];
  } catch {
    pinningEnabled = false;
    pinnedRules = [];
  }
}

// --- Context Menu Setup ---

// Profile directory is encoded directly in menu IDs (e.g. "page:Profile 1")
// so the onClicked handler can extract it without an in-memory map.
// This avoids a race condition in MV3: context menu clicks can wake the
// service worker, but an async init may not have finished populating a map yet.

async function buildContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();

  let profiles: ProfileInfo[];
  try {
    profiles = await getProfiles();
  } catch {
    return; // NMH not available, skip context menus
  }

  if (profiles.length === 0) return;

  const currentEmail = await getCurrentProfileEmail();

  if (profiles.length === 1) {
    const profile = profiles[0];
    const isCurrent = !!(currentEmail && profile.email === currentEmail);

    chrome.contextMenus.create({
      id: `page:${profile.directory}`,
      title: `Open this page in ${profileLabel(profile)}${isCurrent ? " (current)" : ""}`,
      contexts: ["page"],
      enabled: !isCurrent,
    });

    chrome.contextMenus.create({
      id: `link:${profile.directory}`,
      title: `Open link in ${profileLabel(profile)}${isCurrent ? " (current)" : ""}`,
      contexts: ["link"],
      enabled: !isCurrent,
    });
  } else {
    chrome.contextMenus.create({
      id: "page_parent",
      title: "Open this page in\u2026",
      contexts: ["page"],
    });

    chrome.contextMenus.create({
      id: "link_parent",
      title: "Open link in\u2026",
      contexts: ["link"],
    });

    for (const profile of profiles) {
      const isCurrent = !!(currentEmail && profile.email === currentEmail);
      const label = isCurrent
        ? `${profileLabel(profile)} (current)`
        : profileLabel(profile);

      chrome.contextMenus.create({
        id: `page:${profile.directory}`,
        parentId: "page_parent",
        title: label,
        contexts: ["page"],
        enabled: !isCurrent,
      });

      chrome.contextMenus.create({
        id: `link:${profile.directory}`,
        parentId: "link_parent",
        title: label,
        contexts: ["link"],
        enabled: !isCurrent,
      });
    }
  }

  // "Always open this site in\u2026" submenu \u2014 hidden when URL pinning is off,
  // because clicking it would have no effect (avoids the discoverable-but-
  // disabled anti-pattern).
  if (pinningEnabled && profiles.length >= 1) {
    chrome.contextMenus.create({
      id: "pin_parent",
      title: "Always open this site in\u2026",
      contexts: ["page"],
      // documentUrlPatterns avoids showing this on chrome:// or other internal
      // pages where there's no pinnable hostname.
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });

    for (const profile of profiles) {
      chrome.contextMenus.create({
        id: `pin:${profile.directory}`,
        parentId: "pin_parent",
        title: profileLabel(profile),
        contexts: ["page"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      });
    }
  }
}

// --- Core transfer logic ---

async function safeCloseTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // Tab may already be closed
  }
}

interface TransferResult {
  success: boolean;
  error?: string;
}

interface ProfilesResult {
  success: boolean;
  profiles?: ProfileInfo[];
  error?: string;
}

// Cached on init from health_check; controls whether we can route non-http(s)
// URLs and no-URL cases to the new NMH actions or have to bail. Refreshed on
// every health_check message refresh.
let nmhSupportsExtendedTransfer = false;

async function refreshNmhCapabilities(): Promise<{ connected: boolean; version?: string }> {
  const result = await healthCheck();
  nmhSupportsExtendedTransfer = result.connected && isAtLeast(result.version, REQUIRED_NMH_VERSION);
  return result;
}

// Chrome silently drops chrome:// URLs (and some others) when forwarded to an
// already-running Chrome instance via CLI. Workaround: send the target Chrome
// a chrome-extension:// URL it WILL accept, and have that page navigate the
// new tab via chrome.tabs.update — which IS allowed to reach chrome:// from an
// extension context with the tabs permission. http(s) URLs work fine via CLI
// directly, so we only wrap the cases Chrome blocks.
function wrapForCrossProfileNav(url: string): string {
  if (url.startsWith("http:") || url.startsWith("https:")) return url;
  const redirectBase = chrome.runtime.getURL("redirect.html");
  return `${redirectBase}?to=${encodeURIComponent(url)}`;
}

async function handleTransfer(
  url: string | null | undefined,
  targetProfile: string,
  sourceTabId?: number,
): Promise<TransferResult> {
  const hasTransferableUrl = typeof url === "string" && url.length > 0 && isTransferableUrl(url);

  // Branch 1: URL we can transfer. Use open_url. http(s) always works against
  // the published 1.0.0 NMH; non-http schemes require 1.1.0+.
  if (hasTransferableUrl) {
    const isHttp = url!.startsWith("http:") || url!.startsWith("https:");
    if (!isHttp && !nmhSupportsExtendedTransfer) {
      return {
        success: false,
        error: "Update the helper app to transfer this URL — open Settings to update.",
      };
    }
    try {
      const transferUrl = wrapForCrossProfileNav(url!);
      const response = await openUrlInProfile(transferUrl, targetProfile);
      if (response.success) {
        await setLastUsedProfile(targetProfile);
        try {
          const config = await getConfig();
          if (config.closeSourceTab && sourceTabId !== undefined) {
            await safeCloseTab(sourceTabId);
          }
        } catch {
          // Config not available — don't close tab
        }
      }
      return response;
    } catch (err) {
      return { success: false, error: errorMessage(err) };
    }
  }

  // Branch 2: No URL or javascript: URL. Open a fresh window in the target
  // profile via open_profile. Requires 1.1.0+ NMH; on older NMHs we point at
  // Settings instead of the misleading "URL must be http(s)" legacy message —
  // the URL isn't really the problem, the helper app is.
  if (!nmhSupportsExtendedTransfer) {
    return {
      success: false,
      error: "Update the helper app to transfer this URL — open Settings to update.",
    };
  }

  try {
    const response = await openProfile(targetProfile);
    if (response.success) {
      await setLastUsedProfile(targetProfile);
      // Auto-close suppressed: there was no URL transfer, so the source tab
      // is intentional context (e.g. chrome://settings the user was reading).
      // Closing it would be hostile.
    }
    return response;
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

async function handleGetProfiles(forceRefresh?: boolean): Promise<ProfilesResult> {
  try {
    const profiles = await getProfiles(forceRefresh);
    return { success: true, profiles };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

// --- URL pinning auto-redirect ---
//
// onBeforeNavigate fires synchronously before any network request, so there's
// no flash of wrong-profile content. We intentionally don't BLOCK the
// navigation (would require webRequestBlocking permission, much heavier);
// instead we let it proceed in the source tab while opening the URL in the
// target profile and closing the source tab.

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;        // top-frame only — skip iframes
  if (!pinningEnabled) return;
  if (pinnedRules.length === 0) return;

  const rule = findMatchingRule(details.url, pinnedRules);
  if (!rule) return;

  // Loop guard: if we're already in the target profile, don't redirect.
  // Skip defensively when the current directory is unknown — better to miss
  // a redirect than to create an infinite loop.
  const currentDir = await getCurrentProfileDirectory();
  if (!currentDir) return;
  if (currentDir === rule.targetProfileDirectory) return;

  if (!nmhSupportsExtendedTransfer) return;

  try {
    const response = await openUrlInProfile(details.url, rule.targetProfileDirectory);
    if (response.success) {
      await safeCloseTab(details.tabId);
    } else {
      notifyPinFailure(rule.pattern, response.error ?? "Unknown error");
    }
  } catch (err) {
    notifyPinFailure(rule.pattern, errorMessage(err));
  }
});

function notifyPinFailure(pattern: string, reason: string): void {
  // Best-effort surface so users notice when a rule misfires (e.g. target
  // profile was deleted in Chrome). Notifications API is fire-and-forget; if
  // the user has notifications muted, the source tab still stays open which
  // is its own signal.
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title: "Profilissimo: pin didn't fire",
      message: `Couldn't redirect ${pattern}: ${reason}. Check Settings → Pinned URLs.`,
      priority: 0,
    });
  } catch (err) {
    console.error("Profilissimo: notification failed", err);
  }
}

// --- Initialization ---

// Runs on every service worker start (install, Chrome launch, AND wake-from-idle).
// This is critical in MV3: service workers are terminated after ~30s of idle,
// and context menus need their Chrome API state rebuilt on every restart.
void (async () => {
  try {
    const health = await refreshNmhCapabilities();
    if (health.connected) {
      await refreshPinningState();
      // Resolve the current profile directory eagerly so the first
      // onBeforeNavigate firing doesn't have to wait on NMH.
      void getCurrentProfileDirectory();
      await buildContextMenus();
    }
  } catch (err) {
    console.error("Profilissimo: init failed", err);
  }
})();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding/onboarding.html") });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = String(info.menuItemId);

  // Extract prefix ("page", "link", or "pin") and profile directory from menu
  // ID. Directory is everything after the first ":", which is safe because
  // directories are validated against /^[a-zA-Z0-9 _-]+$/ (no colons).
  const colonIndex = menuItemId.indexOf(":");
  if (colonIndex === -1) return;

  const prefix = menuItemId.slice(0, colonIndex);
  const profileDir = menuItemId.slice(colonIndex + 1);

  if (!profileDir) return;

  if (prefix === "pin") {
    if (!tab?.url) return;
    await handleAddPinFromContextMenu(tab.url, profileDir, tab.id);
    return;
  }

  if (prefix !== "page" && prefix !== "link") return;

  const url = prefix === "link" ? info.linkUrl : tab?.url;
  if (!url) return;

  const sourceTabId = prefix === "page" ? tab?.id : undefined;
  const result = await handleTransfer(url, profileDir, sourceTabId);

  if (!result.success) {
    console.error("Profilissimo: context menu transfer failed", result.error);
  }
});

async function handleAddPinFromContextMenu(
  pageUrl: string,
  profileDir: string,
  sourceTabId?: number,
): Promise<void> {
  const hostname = hostnameFromUrl(pageUrl);
  if (!hostname || !isValidPattern(hostname)) {
    console.warn("Profilissimo: cannot pin non-hostname URL", pageUrl);
    return;
  }

  // Replace any existing rule with the same pattern so a second click on a
  // different profile updates the target instead of creating a duplicate.
  const filtered = pinnedRules.filter((r) => r.pattern !== hostname);
  const updated: PinnedRule[] = [
    ...filtered,
    {
      id: uuid(),
      pattern: hostname,
      targetProfileDirectory: profileDir,
      createdAt: Date.now(),
    },
  ];

  try {
    await setConfig({ pinnedRules: updated });
    pinnedRules = updated;
  } catch (err) {
    console.error("Profilissimo: failed to save pinned rule", err);
    return;
  }

  // Pin + go: transfer the URL to the target profile now, mirroring the
  // popup's "always open here" gesture. Skip when pinning to the current
  // profile — Chrome would just open a duplicate tab.
  const currentDir = await getCurrentProfileDirectory();
  if (currentDir && currentDir !== profileDir) {
    const result = await handleTransfer(pageUrl, profileDir, sourceTabId);
    if (!result.success) {
      console.error("Profilissimo: pin-and-go transfer failed", result.error);
    }
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "transfer-to-default") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let targetProfile: string | null = null;
  try {
    const config = await getConfig();
    targetProfile = config.defaultProfile;
  } catch {
    // NMH config not available
  }
  if (!targetProfile) {
    targetProfile = await getLastUsedProfile();
  }

  if (!targetProfile) {
    console.warn("Profilissimo: no default or last-used profile set");
    return;
  }

  const result = await handleTransfer(tab?.url, targetProfile, tab?.id);

  if (!result.success) {
    console.error("Profilissimo: shortcut transfer failed", result.error);
  }
});

// --- Internal message handling ---

interface TransferMessage {
  type: "transfer";
  // Optional: when absent or empty, the service worker routes to open_profile
  // (opens a fresh window in the target profile, no URL transferred).
  url?: string;
  targetProfile: string;
  sourceTabId?: number;
}

interface GetProfilesMessage {
  type: "get_profiles";
  forceRefresh?: boolean;
}

interface HealthCheckMessage {
  type: "health_check";
}

interface RefreshMenusMessage {
  type: "refresh_menus";
}

interface GetConfigMessage {
  type: "get_config";
}

interface SetConfigMessage {
  type: "set_config";
  defaultProfile?: string | null;
  closeSourceTab?: boolean;
  urlPinningEnabled?: boolean;
  pinnedRules?: PinnedRule[];
}

type ExtensionMessage = TransferMessage | GetProfilesMessage | HealthCheckMessage | RefreshMenusMessage | GetConfigMessage | SetConfigMessage;

function isValidMessage(message: unknown): message is ExtensionMessage {
  if (typeof message !== "object" || message === null) return false;
  const msg = message as Record<string, unknown>;
  switch (msg.type) {
    case "transfer":
      return (msg.url === undefined || typeof msg.url === "string") &&
        typeof msg.targetProfile === "string" && msg.targetProfile.length > 0 &&
        (msg.sourceTabId === undefined || typeof msg.sourceTabId === "number");
    case "get_profiles":
      return msg.forceRefresh === undefined || typeof msg.forceRefresh === "boolean";
    case "set_config":
      return (msg.defaultProfile === undefined || msg.defaultProfile === null || typeof msg.defaultProfile === "string") &&
        (msg.closeSourceTab === undefined || typeof msg.closeSourceTab === "boolean") &&
        (msg.urlPinningEnabled === undefined || typeof msg.urlPinningEnabled === "boolean") &&
        (msg.pinnedRules === undefined || Array.isArray(msg.pinnedRules));
    case "health_check":
    case "refresh_menus":
    case "get_config":
      return true;
    default:
      return false;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!isValidMessage(message)) return;

  switch (message.type) {
    case "transfer":
      handleTransfer(message.url, message.targetProfile, message.sourceTabId)
        .then(sendResponse)
        .catch(() => sendResponse({ success: false, error: "Transfer failed unexpectedly" }));
      return true;

    case "get_profiles":
      handleGetProfiles(message.forceRefresh)
        .then(sendResponse)
        .catch(() => sendResponse({ success: false, error: "Failed to load profiles" }));
      return true;

    case "health_check":
      refreshNmhCapabilities()
        .then((result) => sendResponse(result))
        .catch(() => sendResponse({ connected: false }));
      return true;

    case "refresh_menus":
      clearProfileCache();
      (async () => {
        try {
          await refreshCurrentProfileDirectory();
          await buildContextMenus();
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false, error: "Failed to refresh menus" });
        }
      })();
      return true;

    case "get_config":
      getConfig()
        .then((config) => sendResponse({ success: true, config }))
        .catch(() => sendResponse({ success: false, error: "Failed to read config" }));
      return true;

    case "set_config":
      (async () => {
        try {
          await setConfig(message);
          const pinningTouched =
            message.urlPinningEnabled !== undefined || message.pinnedRules !== undefined;
          if (pinningTouched) {
            await refreshPinningState();
            // Rebuild context menus so the "Always open this site in…"
            // submenu appears/disappears in sync with the toggle.
            await buildContextMenus();
          }
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false, error: "Failed to save config" });
        }
      })();
      return true;
  }
});
