import { $ } from "../utils/dom.js";
import { profileLabel } from "../utils/format.js";
import { INSTALL_COMMAND, UNINSTALL_COMMAND, REQUIRED_NMH_VERSION } from "../utils/constants.js";
import { isAtLeast } from "../utils/version.js";
import {
  fetchInstallableProfiles,
  renderInstallList,
  openInAllProfiles,
  summarizeCascade,
  type RowEntry,
} from "../utils/multi-profile-install.js";

const defaultProfileSelect = $("default-profile") as HTMLSelectElement;
const closeSourceTab = $("close-source-tab") as HTMLInputElement;
const shortcutLabel = $("shortcut-label") as HTMLElement;
const shortcutLink = $("shortcut-link") as HTMLAnchorElement;
const nmhIndicator = $("nmh-indicator") as HTMLSpanElement;
const nmhText = $("nmh-text") as HTMLSpanElement;
const nmhVersion = $("nmh-version") as HTMLDivElement;
const nmhAction = $("nmh-action") as HTMLDivElement;
const saveStatusEl = $("save-status") as HTMLDivElement;
const otherProfilesSection = $("other-profiles-section");
const installList = $("profile-install-list") as HTMLUListElement;
const installAllBtn = $("install-all-btn") as HTMLButtonElement;
const installStatus = $("install-status");

let multiEntries: RowEntry[] = [];

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function showSaved(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveStatusEl.classList.remove("hidden");
  saveTimeout = setTimeout(() => saveStatusEl.classList.add("hidden"), 1500);
}

async function saveConfig(updates: { defaultProfile?: string | null; closeSourceTab?: boolean }): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "set_config", ...updates });
    if (response?.success) {
      showSaved();
    } else {
      console.warn("Profilissimo: failed to save config", response?.error);
    }
  } catch {
    console.warn("Profilissimo: failed to save config");
  }
}

function createCopyButton(label: string, command: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "helper-action-btn";
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(command);
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = label;
      }, 1500);
    } catch {
      // clipboard not available
    }
  });
  return btn;
}

type NmhState = "connected-current" | "connected-outdated" | "disconnected";

function renderNmhAction(state: NmhState): void {
  nmhAction.replaceChildren();

  if (state === "connected-current") {
    const btn = createCopyButton("Copy uninstall command", UNINSTALL_COMMAND);
    const hint = document.createElement("p");
    hint.className = "description";
    hint.style.marginTop = "6px";
    hint.style.marginBottom = "0";
    hint.textContent = "Paste in Terminal to remove the helper app.";
    nmhAction.appendChild(btn);
    nmhAction.appendChild(hint);
    return;
  }

  if (state === "connected-outdated") {
    const btn = createCopyButton("Copy update command", INSTALL_COMMAND);
    const hint = document.createElement("p");
    hint.className = "description";
    hint.style.marginTop = "6px";
    hint.style.marginBottom = "0";
    hint.textContent = "An update is available. Paste in Terminal, then restart Chrome.";
    nmhAction.appendChild(btn);
    nmhAction.appendChild(hint);
    return;
  }

  // disconnected
  const btn = createCopyButton("Copy install command", INSTALL_COMMAND);
  const hint = document.createElement("p");
  hint.className = "description";
  hint.style.marginTop = "6px";
  hint.style.marginBottom = "0";
  hint.textContent = "Paste in Terminal, then restart Chrome.";
  nmhAction.appendChild(btn);
  nmhAction.appendChild(hint);
}

async function init(): Promise<void> {
  // Load profiles for the default profile dropdown
  try {
    const response = await chrome.runtime.sendMessage({
      type: "get_profiles",
      forceRefresh: true,
    });

    if (response?.success && response.profiles) {
      const profiles = response.profiles;
      for (const profile of profiles) {
        const option = document.createElement("option");
        option.value = profile.directory;
        option.textContent = profileLabel(profile);
        defaultProfileSelect.appendChild(option);
      }
    }
  } catch (err) {
    console.warn("Profilissimo: failed to load profiles", err);
  }

  // Load shared config from NMH
  try {
    const configResponse = await chrome.runtime.sendMessage({ type: "get_config" });
    if (configResponse?.success && configResponse.config) {
      if (configResponse.config.defaultProfile) {
        defaultProfileSelect.value = configResponse.config.defaultProfile;
        // Clear if profile no longer exists in the dropdown
        if (defaultProfileSelect.value !== configResponse.config.defaultProfile) {
          await chrome.runtime.sendMessage({ type: "set_config", defaultProfile: null });
        }
      }
      closeSourceTab.checked = configResponse.config.closeSourceTab ?? false;
    }
  } catch {
    // NMH config not available
  }

  // Load actual keyboard shortcut from Chrome
  try {
    const commands = await chrome.commands.getAll();
    const transferCmd = commands.find((c) => c.name === "transfer-to-default");
    if (transferCmd?.shortcut) {
      shortcutLabel.textContent = transferCmd.shortcut;
    } else {
      shortcutLabel.textContent = "Not set";
    }
  } catch {
    // Fallback already in HTML
  }

  // Check NMH connectivity
  let connected = false;
  let version: string | null = null;
  try {
    const response = await chrome.runtime.sendMessage({ type: "health_check" });
    connected = !!response?.connected;
    version = response?.version ?? null;
  } catch {
    // NMH not reachable
  }
  const upToDate = connected && isAtLeast(version ?? undefined, REQUIRED_NMH_VERSION);
  const nmhState: NmhState = !connected
    ? "disconnected"
    : upToDate
    ? "connected-current"
    : "connected-outdated";

  nmhIndicator.className = `indicator ${connected ? (upToDate ? "connected" : "outdated") : "disconnected"}`;
  nmhText.textContent = !connected
    ? "Not connected"
    : upToDate
    ? "Connected"
    : "Connected — update available";
  nmhVersion.textContent = version ? `v${version}` : "";
  renderNmhAction(nmhState);

  if (connected) {
    await initOtherProfilesSection();
  }
}

async function initOtherProfilesSection(): Promise<void> {
  const result = await fetchInstallableProfiles();
  if (!result || result.installable.length === 0) return;

  multiEntries = renderInstallList({
    container: installList,
    installable: result.installable,
    current: result.current,
  });

  installAllBtn.textContent =
    result.installable.length === 1
      ? "Open Web Store in 1 other profile"
      : `Open Web Store in ${result.installable.length} other profiles`;

  otherProfilesSection.classList.remove("hidden");
}

installAllBtn.addEventListener("click", async () => {
  if (multiEntries.length === 0) return;

  installAllBtn.disabled = true;
  installAllBtn.textContent = "Opening…";
  installStatus.classList.add("hidden");
  installStatus.className = "install-status";

  const result = await openInAllProfiles(multiEntries);
  const summary = summarizeCascade(result);

  installStatus.classList.remove("hidden");
  installStatus.classList.add(summary.tone);
  installStatus.textContent = summary.text;
  installAllBtn.textContent = summary.buttonLabel;
  installAllBtn.disabled = false;
});

// Open chrome://extensions/shortcuts
shortcutLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// Auto-save on change
defaultProfileSelect.addEventListener("change", () => void saveConfig({ defaultProfile: defaultProfileSelect.value || null }));
closeSourceTab.addEventListener("change", () => void saveConfig({ closeSourceTab: closeSourceTab.checked }));

void init();
