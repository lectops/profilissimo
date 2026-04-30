import { $ } from "../utils/dom.js";
import { profileLabel } from "../utils/format.js";
import { INSTALL_COMMAND, UNINSTALL_COMMAND, REQUIRED_NMH_VERSION, NMH_RELEASE_PAGE_URL } from "../utils/constants.js";
import { isAtLeast } from "../utils/version.js";
import { isValidPattern } from "../utils/pin-matcher.js";
import { uuid } from "../utils/uuid.js";
import type { PinnedRule, ProfileInfo } from "../types/messages.js";
import {
  fetchInstallableProfiles,
  renderInstallList,
  openInAllProfiles,
  summarizeCascade,
  type RowEntry,
} from "../utils/multi-profile-install.js";

const PINNING_DISCLOSURE_SEEN_KEY = "urlPinningDisclosureSeen";

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

const pinningSectionBody = $("pinning-section-body") as HTMLDivElement;
const pinningNeedsUpdate = $("pinning-needs-update") as HTMLDivElement;
const pinningToggle = $("url-pinning-toggle") as HTMLInputElement;
const pinningDisclosure = $("pinning-disclosure") as HTMLDivElement;
const pinningBody = $("pinning-body") as HTMLDivElement;
const rulesTable = $("rules-table") as HTMLTableElement;
const rulesTbody = $("rules-tbody") as HTMLTableSectionElement;
const rulesEmpty = $("rules-empty") as HTMLParagraphElement;
const addRuleForm = $("add-rule-form") as HTMLFormElement;
const addRulePattern = $("add-rule-pattern") as HTMLInputElement;
const addRuleProfile = $("add-rule-profile") as HTMLSelectElement;
const addRuleBtn = $("add-rule-btn") as HTMLButtonElement;
const addRuleError = $("add-rule-error") as HTMLParagraphElement;

let multiEntries: RowEntry[] = [];
let pinnedRulesState: PinnedRule[] = [];
let allProfiles: ProfileInfo[] = [];

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function showSaved(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveStatusEl.classList.remove("hidden");
  saveTimeout = setTimeout(() => saveStatusEl.classList.add("hidden"), 1500);
}

async function saveConfig(updates: {
  defaultProfile?: string | null;
  closeSourceTab?: boolean;
  urlPinningEnabled?: boolean;
  pinnedRules?: PinnedRule[];
}): Promise<void> {
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

function createDownloadLink(): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = NMH_RELEASE_PAGE_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = "Or download manually";
  a.className = "helper-download-link";
  return a;
}

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
    nmhAction.appendChild(createDownloadLink());
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
  nmhAction.appendChild(createDownloadLink());
}

function profileLookupByDirectory(directory: string): { label: string; available: boolean } {
  const match = allProfiles.find((p) => p.directory === directory);
  return match
    ? { label: profileLabel(match), available: true }
    : { label: directory, available: false };
}

function renderRulesTable(): void {
  rulesTbody.replaceChildren();
  const sorted = [...pinnedRulesState].sort((a, b) => a.createdAt - b.createdAt);

  if (sorted.length === 0) {
    rulesTable.classList.add("hidden");
    rulesEmpty.classList.remove("hidden");
    return;
  }

  rulesTable.classList.remove("hidden");
  rulesEmpty.classList.add("hidden");

  for (const rule of sorted) {
    const tr = document.createElement("tr");

    const tdPattern = document.createElement("td");
    tdPattern.textContent = rule.pattern;
    tdPattern.className = "rules-pattern";
    tr.appendChild(tdPattern);

    const tdTarget = document.createElement("td");
    const lookup = profileLookupByDirectory(rule.targetProfileDirectory);
    tdTarget.textContent = lookup.available ? lookup.label : `${lookup.label} (unavailable)`;
    if (!lookup.available) {
      tdTarget.classList.add("rules-target-unavailable");
    }
    tr.appendChild(tdTarget);

    const tdActions = document.createElement("td");
    tdActions.className = "rules-actions-col";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "rule-remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute("aria-label", `Remove rule for ${rule.pattern}`);
    removeBtn.addEventListener("click", () => void removeRule(rule.id));
    tdActions.appendChild(removeBtn);
    tr.appendChild(tdActions);

    rulesTbody.appendChild(tr);
  }
}

function refreshAddRuleProfileOptions(): void {
  // Keep the placeholder, replace the rest.
  while (addRuleProfile.options.length > 1) addRuleProfile.remove(1);
  for (const profile of allProfiles) {
    const option = document.createElement("option");
    option.value = profile.directory;
    option.textContent = profileLabel(profile);
    addRuleProfile.appendChild(option);
  }
}

function applyNmhVersionGate(supported: boolean): void {
  pinningSectionBody.classList.toggle("hidden", !supported);
  pinningNeedsUpdate.classList.toggle("hidden", supported);
}

function applyPinningEnabledState(enabled: boolean): void {
  pinningBody.classList.toggle("disabled", !enabled);
  // When disabled, controls remain visible (so users can still manage rules
  // without flipping the toggle just to look) but interactions are inert.
  addRulePattern.disabled = !enabled;
  addRuleProfile.disabled = !enabled;
  addRuleBtn.disabled = !enabled;
  for (const btn of rulesTbody.querySelectorAll<HTMLButtonElement>(".rule-remove-btn")) {
    btn.disabled = !enabled;
  }
}

async function showFirstTimeDisclosureIfNeeded(): Promise<void> {
  const result = await chrome.storage.local.get({ [PINNING_DISCLOSURE_SEEN_KEY]: false });
  if (result[PINNING_DISCLOSURE_SEEN_KEY]) return;
  pinningDisclosure.classList.remove("hidden");
  await chrome.storage.local.set({ [PINNING_DISCLOSURE_SEEN_KEY]: true });
}

async function removeRule(id: string): Promise<void> {
  pinnedRulesState = pinnedRulesState.filter((r) => r.id !== id);
  renderRulesTable();
  applyPinningEnabledState(pinningToggle.checked);
  await saveConfig({ pinnedRules: pinnedRulesState });
}

function showAddRuleError(message: string): void {
  addRuleError.textContent = message;
  addRuleError.classList.remove("hidden");
}

function clearAddRuleError(): void {
  addRuleError.textContent = "";
  addRuleError.classList.add("hidden");
}

async function handleAddRule(event: Event): Promise<void> {
  event.preventDefault();
  clearAddRuleError();

  const pattern = addRulePattern.value.trim().toLowerCase();
  const targetDir = addRuleProfile.value;

  if (!pattern) {
    showAddRuleError("Hostname is required.");
    return;
  }
  if (!isValidPattern(pattern)) {
    showAddRuleError("Hostname must be a plain domain (no scheme, path, or special characters).");
    return;
  }
  if (!targetDir) {
    showAddRuleError("Choose a profile.");
    return;
  }
  if (pinnedRulesState.some((r) => r.pattern === pattern)) {
    showAddRuleError(`A rule for ${pattern} already exists. Remove it first.`);
    return;
  }

  pinnedRulesState = [
    ...pinnedRulesState,
    {
      id: uuid(),
      pattern,
      targetProfileDirectory: targetDir,
      createdAt: Date.now(),
    },
  ];

  addRulePattern.value = "";
  addRuleProfile.value = "";
  renderRulesTable();
  applyPinningEnabledState(pinningToggle.checked);
  await saveConfig({ pinnedRules: pinnedRulesState });
}

async function handlePinningToggleChange(): Promise<void> {
  const enabled = pinningToggle.checked;
  applyPinningEnabledState(enabled);
  if (enabled) {
    await showFirstTimeDisclosureIfNeeded();
  }
  await saveConfig({ urlPinningEnabled: enabled });
}

async function init(): Promise<void> {
  // Load profiles for the default profile dropdown
  try {
    const response = await chrome.runtime.sendMessage({
      type: "get_profiles",
      forceRefresh: true,
    });

    if (response?.success && response.profiles) {
      allProfiles = response.profiles;
      for (const profile of allProfiles) {
        const option = document.createElement("option");
        option.value = profile.directory;
        option.textContent = profileLabel(profile);
        defaultProfileSelect.appendChild(option);
      }
      refreshAddRuleProfileOptions();
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
      pinningToggle.checked = configResponse.config.urlPinningEnabled === true;
      pinnedRulesState = Array.isArray(configResponse.config.pinnedRules)
        ? configResponse.config.pinnedRules
        : [];
    }
  } catch {
    // NMH config not available
  }

  renderRulesTable();
  applyPinningEnabledState(pinningToggle.checked);

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

  // Gate the Pinned URLs interactive UI on NMH version. On 1.0.0 NMH the
  // toggle would silently fail to persist (old NMH ignores unknown config
  // fields), so hide the controls and show a "needs update" notice instead.
  applyNmhVersionGate(connected && upToDate);

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

pinningToggle.addEventListener("change", () => void handlePinningToggleChange());
addRuleForm.addEventListener("submit", (event) => void handleAddRule(event));
addRulePattern.addEventListener("input", clearAddRuleError);

void init();
