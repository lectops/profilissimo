import { $ } from "../utils/dom.js";
import { applyChip } from "../utils/format.js";
import { INSTALL_COMMAND, UNINSTALL_COMMAND, REQUIRED_NMH_VERSION, NMH_RELEASE_PAGE_URL } from "../utils/constants.js";
import { isAtLeast } from "../utils/version.js";
import { isValidPattern } from "../utils/pin-matcher.js";
import { uuid } from "../utils/uuid.js";
import type { AppConfig, PinnedRule, ProfileInfo } from "../types/messages.js";
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
const otherProfilesToggle = $("other-profiles-toggle") as HTMLButtonElement;
const otherProfilesToggleLabel = $("other-profiles-toggle-label") as HTMLSpanElement;
const otherProfilesDismissLink = $("other-profiles-dismiss-link") as HTMLAnchorElement;
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

const exportBtn = $("export-btn") as HTMLButtonElement;
const importBtn = $("import-btn") as HTMLButtonElement;
const importFile = $("import-file") as HTMLInputElement;
const backupStatus = $("backup-status") as HTMLParagraphElement;

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
  defaultProfileEmail?: string | null;
  closeSourceTab?: boolean;
  urlPinningEnabled?: boolean;
  pinnedRules?: PinnedRule[];
  otherResidencesDismissed?: boolean;
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
  a.textContent = "Or download manually →";
  a.className = "helper-download-link";
  return a;
}

function renderNmhAction(state: NmhState): void {
  nmhAction.replaceChildren();

  if (state === "connected-current") {
    const btn = createCopyButton("Copy uninstall", UNINSTALL_COMMAND);
    const hint = document.createElement("p");
    hint.textContent = "Paste in Terminal to uninstall the helper app.";
    nmhAction.appendChild(btn);
    nmhAction.appendChild(hint);
    return;
  }

  if (state === "connected-outdated") {
    const btn = createCopyButton("Copy update", INSTALL_COMMAND);
    const hint = document.createElement("p");
    hint.textContent = "An update is available. Paste in Terminal, then restart Chrome.";
    nmhAction.appendChild(btn);
    nmhAction.appendChild(hint);
    nmhAction.appendChild(createDownloadLink());
    return;
  }

  // disconnected
  const btn = createCopyButton("Copy install", INSTALL_COMMAND);
  const hint = document.createElement("p");
  hint.textContent = "Paste in Terminal, then restart Chrome.";
  nmhAction.appendChild(btn);
  nmhAction.appendChild(hint);
  nmhAction.appendChild(createDownloadLink());
}

function profileLookupByDirectory(directory: string): { label: string; available: boolean; index: number } {
  const idx = allProfiles.findIndex((p) => p.directory === directory);
  if (idx === -1) return { label: directory, available: false, index: -1 };
  return { label: allProfiles[idx].name, available: true, index: idx };
}

// Resolve a rule to a profile for display, preferring the account email (the
// portable identity) over the stored directory. Rules created before email
// capture, or whose account is signed out, fall back to directory matching.
function profileLookupForRule(rule: PinnedRule): { label: string; available: boolean; index: number } {
  if (rule.targetProfileEmail) {
    const idx = allProfiles.findIndex((p) => p.email === rule.targetProfileEmail);
    if (idx !== -1) return { label: allProfiles[idx].name, available: true, index: idx };
  }
  return profileLookupByDirectory(rule.targetProfileDirectory);
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
    tdPattern.className = "rules__pattern";
    tr.appendChild(tdPattern);

    const tdTarget = document.createElement("td");
    const lookup = profileLookupForRule(rule);
    const targetWrap = document.createElement("span");
    targetWrap.className = "rules__target";

    if (lookup.available) {
      const chip = document.createElement("span");
      chip.classList.add("rules__target-chip");
      applyChip(chip, allProfiles[lookup.index], lookup.index);
      targetWrap.appendChild(chip);

      const name = document.createElement("span");
      name.textContent = lookup.label;
      targetWrap.appendChild(name);
    } else {
      targetWrap.classList.add("rules__target-unavailable");
      targetWrap.textContent = `${lookup.label} (unavailable)`;
    }

    tdTarget.appendChild(targetWrap);
    tr.appendChild(tdTarget);

    const tdActions = document.createElement("td");
    tdActions.className = "rules__actions-col";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "rule-remove-btn";
    removeBtn.textContent = "remove";
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
    option.textContent = profile.name;
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

  const targetEmail = allProfiles.find((p) => p.directory === targetDir)?.email;
  pinnedRulesState = [
    ...pinnedRulesState,
    {
      id: uuid(),
      pattern,
      targetProfileDirectory: targetDir,
      ...(targetEmail ? { targetProfileEmail: targetEmail } : {}),
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
        option.textContent = profile.email
          ? `${profile.name} — ${profile.email}`
          : profile.name;
        defaultProfileSelect.appendChild(option);
      }
      refreshAddRuleProfileOptions();
    }
  } catch (err) {
    console.warn("Profilissimo: failed to load profiles", err);
  }

  // Load shared config from NMH
  let otherResidencesDismissed = false;
  try {
    const configResponse = await chrome.runtime.sendMessage({ type: "get_config" });
    if (configResponse?.success && configResponse.config) {
      const cfg = configResponse.config;
      const emailMatch = cfg.defaultProfileEmail
        ? allProfiles.find((p) => p.email === cfg.defaultProfileEmail)
        : undefined;
      if (emailMatch) {
        // Email is the source of truth — point the select at wherever that
        // account currently lives, and re-heal the stored directory if it
        // drifted (e.g. after a machine migration).
        defaultProfileSelect.value = emailMatch.directory;
        if (cfg.defaultProfile !== emailMatch.directory) {
          await chrome.runtime.sendMessage({
            type: "set_config",
            defaultProfile: emailMatch.directory,
            defaultProfileEmail: emailMatch.email,
          });
        }
      } else if (cfg.defaultProfile) {
        defaultProfileSelect.value = cfg.defaultProfile;
        // Clear if profile no longer exists in the dropdown
        if (defaultProfileSelect.value !== cfg.defaultProfile) {
          await chrome.runtime.sendMessage({ type: "set_config", defaultProfile: null });
        }
      }
      closeSourceTab.checked = configResponse.config.closeSourceTab ?? false;
      pinningToggle.checked = configResponse.config.urlPinningEnabled === true;
      pinnedRulesState = Array.isArray(configResponse.config.pinnedRules)
        ? configResponse.config.pinnedRules
        : [];
      otherResidencesDismissed = configResponse.config.otherResidencesDismissed === true;
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

  nmhIndicator.className = `nmh-card__indicator ${connected ? (upToDate ? "connected" : "outdated") : "disconnected"}`;
  nmhText.textContent = !connected
    ? "Not connected"
    : upToDate
    ? "Connected"
    : "Connected — update available";
  nmhVersion.textContent = version ? `— v${version}` : "";
  renderNmhAction(nmhState);

  // Gate the Pinned URLs interactive UI on NMH version. On 1.0.0 NMH the
  // toggle would silently fail to persist (old NMH ignores unknown config
  // fields), so hide the controls and show a "needs update" notice instead.
  applyNmhVersionGate(connected && upToDate);

  if (connected) {
    await initOtherProfilesSection(otherResidencesDismissed);
  }
}

async function initOtherProfilesSection(dismissed: boolean): Promise<void> {
  const result = await fetchInstallableProfiles();
  if (!result || result.installable.length === 0) return;

  multiEntries = renderInstallList({
    container: installList,
    installable: result.installable,
    current: result.current,
  });

  installAllBtn.textContent =
    result.installable.length === 1
      ? "Open the Web Store in 1 other profile  →"
      : `Open the Web Store in ${result.installable.length} other profiles  →`;

  setOtherProfilesCollapsed(dismissed);
  otherProfilesSection.classList.remove("hidden");
}

function setOtherProfilesCollapsed(collapsed: boolean): void {
  otherProfilesSection.classList.toggle("section--collapsed", collapsed);
  otherProfilesToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  otherProfilesToggleLabel.textContent = collapsed ? "Show" : "Hide";
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

// Other residences accordion + dismissal. The collapse state isn't persisted —
// it only persists once the user explicitly says "I've done that already" via
// the dismiss link, which writes otherResidencesDismissed to NMH config so the
// section starts collapsed in every profile thereafter.
otherProfilesToggle.addEventListener("click", () => {
  const collapsed = otherProfilesSection.classList.contains("section--collapsed");
  setOtherProfilesCollapsed(!collapsed);
});

otherProfilesDismissLink.addEventListener("click", (e) => {
  e.preventDefault();
  setOtherProfilesCollapsed(true);
  void saveConfig({ otherResidencesDismissed: true });
});

// Auto-save on change
defaultProfileSelect.addEventListener("change", () => {
  const dir = defaultProfileSelect.value || null;
  const email = dir ? (allProfiles.find((p) => p.directory === dir)?.email ?? null) : null;
  void saveConfig({ defaultProfile: dir, defaultProfileEmail: email });
});
closeSourceTab.addEventListener("change", () => void saveConfig({ closeSourceTab: closeSourceTab.checked }));

pinningToggle.addEventListener("change", () => void handlePinningToggleChange());
addRuleForm.addEventListener("submit", (event) => void handleAddRule(event));
addRulePattern.addEventListener("input", clearAddRuleError);

// --- Backup & restore ---

const BACKUP_TYPE = "profilissimo-settings";
const PROFILE_DIR_RE = /^[a-zA-Z0-9 _-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BackupFile {
  type: string;
  schema: number;
  exportedAt: string;
  settings: Record<string, unknown>;
}

function showBackupStatus(message: string, kind: "success" | "error" | "info"): void {
  backupStatus.textContent = message;
  backupStatus.classList.remove("hidden", "success", "error");
  if (kind !== "info") backupStatus.classList.add(kind);
}

async function exportSettings(): Promise<void> {
  let config: AppConfig | undefined;
  try {
    const resp = await chrome.runtime.sendMessage({ type: "get_config" });
    if (resp?.success && resp.config) config = resp.config as AppConfig;
  } catch {
    // fall through to the error message below
  }
  if (!config) {
    showBackupStatus("Couldn't read your settings — is the helper app connected?", "error");
    return;
  }

  const payload: BackupFile = {
    type: BACKUP_TYPE,
    schema: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      defaultProfile: config.defaultProfile,
      defaultProfileEmail: config.defaultProfileEmail,
      closeSourceTab: config.closeSourceTab,
      urlPinningEnabled: config.urlPinningEnabled,
      pinnedRules: config.pinnedRules,
      otherResidencesDismissed: config.otherResidencesDismissed,
    },
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `profilissimo-settings-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const n = config.pinnedRules.length;
  showBackupStatus(`Exported your settings and ${n} binding${n === 1 ? "" : "s"}.`, "success");
}

// Re-point an imported target's directory to wherever its account currently
// lives on THIS machine. The email is the portable key; the stored directory
// is only a fallback that's likely stale on a different Mac.
function rehealDirectory(email: string | undefined, fallback: string): string {
  if (email) {
    const match = allProfiles.find((p) => p.email === email);
    if (match) return match.directory;
  }
  return fallback;
}

// Validate an imported rule against the same constraints the helper app
// enforces, so a single malformed entry can't fail the whole import. Returns
// null (and gets counted as skipped) when the rule can't be salvaged.
function importableRule(value: unknown): PinnedRule | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > 64) return null;
  if (typeof r.pattern !== "string" || !isValidPattern(r.pattern)) return null;
  if (typeof r.targetProfileDirectory !== "string" || !PROFILE_DIR_RE.test(r.targetProfileDirectory)) return null;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return null;
  const email = typeof r.targetProfileEmail === "string" && EMAIL_RE.test(r.targetProfileEmail) ? r.targetProfileEmail : undefined;
  const rule: PinnedRule = {
    id: r.id,
    pattern: r.pattern,
    targetProfileDirectory: rehealDirectory(email, r.targetProfileDirectory),
    createdAt: r.createdAt,
  };
  if (email) rule.targetProfileEmail = email;
  return rule;
}

async function importSettings(file: File): Promise<void> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    showBackupStatus("Couldn't read that file.", "error");
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    showBackupStatus("That file isn't valid JSON.", "error");
    return;
  }

  const wrapper = parsed as Partial<BackupFile> | null;
  if (!wrapper || wrapper.type !== BACKUP_TYPE || typeof wrapper.settings !== "object" || wrapper.settings === null) {
    showBackupStatus("That doesn't look like a Profilissimo settings file.", "error");
    return;
  }

  const s = wrapper.settings as Record<string, unknown>;

  const rawRules = Array.isArray(s.pinnedRules) ? s.pinnedRules : [];
  const rules: PinnedRule[] = [];
  let dropped = 0;
  for (const raw of rawRules) {
    const rule = importableRule(raw);
    if (rule) rules.push(rule);
    else dropped++;
  }

  const defaultProfileEmail =
    typeof s.defaultProfileEmail === "string" && EMAIL_RE.test(s.defaultProfileEmail) ? s.defaultProfileEmail : null;
  let defaultProfile =
    typeof s.defaultProfile === "string" && PROFILE_DIR_RE.test(s.defaultProfile) ? s.defaultProfile : null;
  if (defaultProfileEmail) {
    const match = allProfiles.find((p) => p.email === defaultProfileEmail);
    if (match) defaultProfile = match.directory;
  }

  const closeSrc = typeof s.closeSourceTab === "boolean" ? s.closeSourceTab : undefined;
  const pinning = typeof s.urlPinningEnabled === "boolean" ? s.urlPinningEnabled : undefined;
  const dismissed = typeof s.otherResidencesDismissed === "boolean" ? s.otherResidencesDismissed : undefined;

  const n = rules.length;
  if (!window.confirm(`Import will replace your current settings with ${n} binding${n === 1 ? "" : "s"} from this file. Continue?`)) {
    showBackupStatus("Import cancelled.", "info");
    return;
  }

  const update: {
    defaultProfile: string | null;
    defaultProfileEmail: string | null;
    pinnedRules: PinnedRule[];
    closeSourceTab?: boolean;
    urlPinningEnabled?: boolean;
    otherResidencesDismissed?: boolean;
  } = { defaultProfile, defaultProfileEmail, pinnedRules: rules };
  if (closeSrc !== undefined) update.closeSourceTab = closeSrc;
  if (pinning !== undefined) update.urlPinningEnabled = pinning;
  if (dismissed !== undefined) update.otherResidencesDismissed = dismissed;

  let resp: { success?: boolean; error?: string } | undefined;
  try {
    resp = await chrome.runtime.sendMessage({ type: "set_config", ...update });
  } catch {
    showBackupStatus("Import failed — couldn't reach the helper app.", "error");
    return;
  }
  if (!resp?.success) {
    showBackupStatus(`Import failed: ${resp?.error ?? "unknown error"}.`, "error");
    return;
  }

  // Reflect the imported state in the UI without a full page reload.
  pinnedRulesState = rules;
  if (closeSrc !== undefined) closeSourceTab.checked = closeSrc;
  if (pinning !== undefined) pinningToggle.checked = pinning;
  defaultProfileSelect.value = defaultProfile ?? "";
  renderRulesTable();
  applyPinningEnabledState(pinningToggle.checked);

  const tail = dropped > 0 ? ` (${dropped} invalid binding${dropped === 1 ? "" : "s"} skipped)` : "";
  showBackupStatus(`Imported ${n} binding${n === 1 ? "" : "s"}${tail}.`, "success");
}

exportBtn.addEventListener("click", () => void exportSettings());
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
  const file = importFile.files?.[0];
  importFile.value = ""; // reset so the same file can be re-imported
  if (file) void importSettings(file);
});

void init();
