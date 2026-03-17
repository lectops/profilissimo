import { $ } from "../utils/dom.js";
import { profileLabel } from "../utils/format.js";
import { getPreferences, setPreferences } from "../utils/storage.js";

const defaultProfileSelect = $("default-profile") as HTMLSelectElement;
const closeSourceTab = $("close-source-tab") as HTMLInputElement;
const showNotifications = $("show-notifications") as HTMLInputElement;
const shortcutLabel = $("shortcut-label") as HTMLElement;
const shortcutLink = $("shortcut-link") as HTMLAnchorElement;
const nmhIndicator = $("nmh-indicator") as HTMLSpanElement;
const nmhText = $("nmh-text") as HTMLSpanElement;
const nmhAction = $("nmh-action") as HTMLDivElement;
const saveStatusEl = $("save-status") as HTMLDivElement;

const INSTALL_COMMAND = `curl -fsSL https://raw.githubusercontent.com/lectops/profilissimo/main/installer/install.sh | bash`;
const UNINSTALL_COMMAND = `rm -rf ~/.profilissimo && rm "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.profilissimo.nmh.json"`;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function showSaved(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveStatusEl.classList.remove("hidden");
  saveTimeout = setTimeout(() => saveStatusEl.classList.add("hidden"), 1500);
}

async function savePreferences(): Promise<void> {
  await setPreferences({
    defaultProfile: defaultProfileSelect.value || null,
    closeSourceTab: closeSourceTab.checked,
    showNotifications: showNotifications.checked,
  });
  showSaved();
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

function renderNmhAction(connected: boolean): void {
  nmhAction.replaceChildren();

  if (connected) {
    const btn = createCopyButton("Copy uninstall command", UNINSTALL_COMMAND);
    const hint = document.createElement("p");
    hint.className = "description";
    hint.style.marginTop = "6px";
    hint.style.marginBottom = "0";
    hint.textContent = "Paste in Terminal to remove the helper app.";
    nmhAction.appendChild(btn);
    nmhAction.appendChild(hint);
  } else {
    const btn = createCopyButton("Copy install command", INSTALL_COMMAND);
    const hint = document.createElement("p");
    hint.className = "description";
    hint.style.marginTop = "6px";
    hint.style.marginBottom = "0";
    hint.textContent = "Paste in Terminal, then restart Chrome.";
    nmhAction.appendChild(btn);
    nmhAction.appendChild(hint);
  }
}

async function init(): Promise<void> {
  // Load preferences first
  const prefs = await getPreferences();

  closeSourceTab.checked = prefs.closeSourceTab;
  showNotifications.checked = prefs.showNotifications;

  // Load profiles, then apply saved default profile selection
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

  // Apply saved default after options are populated
  if (prefs.defaultProfile) {
    defaultProfileSelect.value = prefs.defaultProfile;
    // Clear stale reference if profile no longer exists
    if (defaultProfileSelect.value !== prefs.defaultProfile) {
      await setPreferences({ defaultProfile: null });
    }
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
  try {
    const response = await chrome.runtime.sendMessage({ type: "health_check" });
    connected = !!response?.connected;
  } catch {
    // NMH not reachable
  }
  nmhIndicator.className = `indicator ${connected ? "connected" : "disconnected"}`;
  nmhText.textContent = connected
    ? "Connected"
    : "Not connected";
  renderNmhAction(connected);
}

// Open chrome://extensions/shortcuts
shortcutLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// Auto-save on change
defaultProfileSelect.addEventListener("change", () => void savePreferences());
closeSourceTab.addEventListener("change", () => void savePreferences());
showNotifications.addEventListener("change", () => void savePreferences());

void init();
