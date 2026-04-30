import type { ProfileInfo } from "../types/messages.js";
import { profileLabel, errorMessage } from "../utils/format.js";
import { healthCheck, openUrlInProfile, openProfile, getConfig, setConfig } from "../utils/native-messaging.js";
import { isTransferableUrl } from "../utils/url.js";
import { getProfiles, clearProfileCache } from "../utils/profiles.js";
import { getLastUsedProfile, setLastUsedProfile } from "../utils/storage.js";
import { isAtLeast } from "../utils/version.js";
import { REQUIRED_NMH_VERSION } from "../utils/constants.js";

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
        error: "Your helper app needs to be updated to transfer this URL. Open Settings to update.",
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
  // profile via open_profile. Requires 1.1.0+ NMH; bail with the legacy
  // message on older NMHs so users see today's behavior, not a confusing new
  // one.
  if (!nmhSupportsExtendedTransfer) {
    return { success: false, error: "URL must use http: or https: scheme" };
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

// --- Initialization ---

// Runs on every service worker start (install, Chrome launch, AND wake-from-idle).
// This is critical in MV3: service workers are terminated after ~30s of idle,
// and context menus need their Chrome API state rebuilt on every restart.
void (async () => {
  try {
    const health = await refreshNmhCapabilities();
    if (health.connected) {
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

  // Extract prefix ("page" or "link") and profile directory from menu ID.
  // Directory is everything after the first ":", which is safe because
  // directories are validated against /^[a-zA-Z0-9 _-]+$/ (no colons).
  const colonIndex = menuItemId.indexOf(":");
  if (colonIndex === -1) return;

  const prefix = menuItemId.slice(0, colonIndex);
  const profileDir = menuItemId.slice(colonIndex + 1);

  if ((prefix !== "page" && prefix !== "link") || !profileDir) return;

  const url = prefix === "link" ? info.linkUrl : tab?.url;
  if (!url) return;

  const sourceTabId = prefix === "page" ? tab?.id : undefined;
  const result = await handleTransfer(url, profileDir, sourceTabId);

  if (!result.success) {
    console.error("Profilissimo: context menu transfer failed", result.error);
  }
});

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
        (msg.closeSourceTab === undefined || typeof msg.closeSourceTab === "boolean");
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
      buildContextMenus()
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false, error: "Failed to refresh menus" }));
      return true;

    case "get_config":
      getConfig()
        .then((config) => sendResponse({ success: true, config }))
        .catch(() => sendResponse({ success: false, error: "Failed to read config" }));
      return true;

    case "set_config":
      setConfig(message)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false, error: "Failed to save config" }));
      return true;
  }
});
