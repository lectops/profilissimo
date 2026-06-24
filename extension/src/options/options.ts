import { $ } from "../utils/dom.js";
import { applyChip } from "../utils/format.js";
import { INSTALL_COMMAND, REQUIRED_NMH_VERSION, NMH_RELEASE_PAGE_URL } from "../utils/constants.js";
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
import { renderHelperStatus, type HelperState } from "../shared/helper-status.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const defaultProfileSelect    = $("default-profile") as HTMLSelectElement;
const shortcutLabel           = $("shortcut-label") as HTMLElement;
const shortcutLink            = $("shortcut-link") as HTMLAnchorElement;

// Custom toggle: close-source-tab
const closeSourceTrack        = $("close-source-track") as HTMLSpanElement;
const closeSourceCheckbox     = $("close-source-tab") as HTMLInputElement;

// Pinned sites
const pinningNeedsUpdate      = $("pinning-needs-update") as HTMLDivElement;
const pinningSectionBody      = $("pinning-section-body") as HTMLDivElement;
const autoRedirectTrack       = $("auto-redirect-track") as HTMLSpanElement;
const autoRedirectCheckbox    = $("url-pinning-toggle") as HTMLInputElement;
const pinningDisclosure       = $("pinning-disclosure") as HTMLDivElement;
const pinningBody             = $("pinning-body") as HTMLDivElement;
const pinsTableWrap           = $("pins-table-wrap") as HTMLDivElement;
const pinsTbody               = $("pins-tbody") as HTMLDivElement;
const pinsEmpty               = $("pins-empty") as HTMLDivElement;
const addRuleForm             = $("add-rule-form") as HTMLFormElement;
const addRulePattern          = $("add-rule-pattern") as HTMLInputElement;
const addRuleProfile          = $("add-rule-profile") as HTMLSelectElement;
const addRuleBtn              = $("add-rule-btn") as HTMLButtonElement;
const addRuleError            = $("add-rule-error") as HTMLParagraphElement;

// Helper-status mount
const helperStatusMount       = $("helper-status-mount") as HTMLDivElement;

// Backup
const exportBtn               = $("export-btn") as HTMLButtonElement;
const importBtn               = $("import-btn") as HTMLButtonElement;
const importFile              = $("import-file") as HTMLInputElement;
const backupStatus            = $("backup-status") as HTMLParagraphElement;

// Other profiles (§06)
const otherProfilesSection    = $("other-profiles-section") as HTMLElement;
const otherProfilesToggle     = $("other-profiles-toggle") as HTMLButtonElement;
const otherProfilesToggleLabel = $("other-profiles-toggle-label") as HTMLSpanElement;
const installList             = $("profile-install-list") as HTMLUListElement;
const installAllBtn           = $("install-all-btn") as HTMLButtonElement;
const installStatus           = $("install-status") as HTMLParagraphElement;
const otherProfilesDismissLink = $("other-profiles-dismiss-link") as HTMLAnchorElement;

// Toast
const saveStatusEl            = $("save-status") as HTMLDivElement;

// ── State ─────────────────────────────────────────────────────────────────────

let multiEntries: RowEntry[] = [];
let pinnedRulesState: PinnedRule[] = [];
let allProfiles: ProfileInfo[] = [];
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

const PINNING_DISCLOSURE_SEEN_KEY = "urlPinningDisclosureSeen";

// ── Saved toast ───────────────────────────────────────────────────────────────

function showToast(message?: string): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  const original = saveStatusEl.textContent ?? "Saved.";
  if (message) saveStatusEl.textContent = message;
  saveStatusEl.classList.remove("hidden");
  saveTimeout = setTimeout(() => {
    saveStatusEl.classList.add("hidden");
    if (message) saveStatusEl.textContent = original;
  }, 1500);
}

function showSaved(): void {
  showToast();
}

// ── Config save ───────────────────────────────────────────────────────────────

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

// ── Custom toggle helpers ─────────────────────────────────────────────────────

function setToggleVisual(track: HTMLSpanElement, on: boolean): void {
  track.classList.toggle("is-on", on);
}

function bindToggleRow(
  track: HTMLSpanElement,
  checkbox: HTMLInputElement,
  onChange: (checked: boolean) => void
): void {
  // Click anywhere on the toggle-row row activates the toggle.
  // The hidden checkbox handles keyboard Enter/Space via native behaviour.
  const row = track.closest(".toggle-row");
  if (row) {
    row.addEventListener("click", (e) => {
      // Avoid double-firing when the real checkbox is clicked
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      checkbox.checked = !checkbox.checked;
      setToggleVisual(track, checkbox.checked);
      onChange(checkbox.checked);
    });
  }
  checkbox.addEventListener("change", () => {
    setToggleVisual(track, checkbox.checked);
    onChange(checkbox.checked);
  });
}

// ── Profile chip helpers ──────────────────────────────────────────────────────

function profileLookupByDirectory(directory: string): { label: string; available: boolean; index: number } {
  const idx = allProfiles.findIndex((p) => p.directory === directory);
  if (idx === -1) return { label: directory, available: false, index: -1 };
  return { label: allProfiles[idx].name, available: true, index: idx };
}

function profileLookupForRule(rule: PinnedRule): { label: string; available: boolean; index: number } {
  if (rule.targetProfileEmail) {
    const idx = allProfiles.findIndex((p) => p.email === rule.targetProfileEmail);
    if (idx !== -1) return { label: allProfiles[idx].name, available: true, index: idx };
  }
  return profileLookupByDirectory(rule.targetProfileDirectory);
}

// ── Pins table ────────────────────────────────────────────────────────────────

function renderPinsTable(): void {
  pinsTbody.replaceChildren();
  const sorted = [...pinnedRulesState].sort((a, b) => a.createdAt - b.createdAt);

  if (sorted.length === 0) {
    pinsTableWrap.classList.add("hidden");
    pinsEmpty.classList.remove("hidden");
    return;
  }

  pinsTableWrap.classList.remove("hidden");
  pinsEmpty.classList.add("hidden");

  for (const rule of sorted) {
    const row = document.createElement("div");
    row.className = "pins-row";

    // Hostname column
    const hostCol = document.createElement("span");
    hostCol.className = "pins-row__hostname";
    hostCol.textContent = rule.pattern;
    row.appendChild(hostCol);

    // Profile column
    const profileCol = document.createElement("span");
    profileCol.className = "pins-row__profile";

    const lookup = profileLookupForRule(rule);
    if (lookup.available) {
      const chip = document.createElement("span");
      chip.className = "pins-row__chip";
      applyChip(chip, allProfiles[lookup.index], lookup.index);
      profileCol.appendChild(chip);

      const name = document.createElement("span");
      name.className = "pins-row__profile-name";
      name.textContent = lookup.label;
      profileCol.appendChild(name);
    } else {
      const name = document.createElement("span");
      name.className = "pins-row__profile-name pins-row__profile-name--unavailable";
      name.textContent = `${lookup.label} (unavailable)`;
      profileCol.appendChild(name);
    }
    row.appendChild(profileCol);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "pins-row__remove";
    removeBtn.setAttribute("aria-label", `Remove pin for ${rule.pattern}`);
    removeBtn.title = `Remove pin for ${rule.pattern}`;
    removeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`;
    removeBtn.addEventListener("click", () => void removeRule(rule.id));
    row.appendChild(removeBtn);

    pinsTbody.appendChild(row);
  }
}

function refreshAddRuleProfileOptions(): void {
  while (addRuleProfile.options.length > 1) addRuleProfile.remove(1);
  for (const profile of allProfiles) {
    const option = document.createElement("option");
    option.value = profile.directory;
    option.textContent = profile.name;
    addRuleProfile.appendChild(option);
  }
}

// ── Pinning gate helpers ──────────────────────────────────────────────────────

function applyNmhVersionGate(supported: boolean): void {
  pinningSectionBody.classList.toggle("hidden", !supported);
  pinningNeedsUpdate.classList.toggle("hidden", supported);
}

function applyPinningEnabledState(enabled: boolean): void {
  pinningBody.classList.toggle("is-disabled", !enabled);
  addRulePattern.disabled = !enabled;
  addRuleProfile.disabled = !enabled;
  addRuleBtn.disabled = !enabled;
  for (const btn of pinsTbody.querySelectorAll<HTMLButtonElement>(".pins-row__remove")) {
    btn.disabled = !enabled;
  }
}

async function showFirstTimeDisclosureIfNeeded(): Promise<void> {
  const result = await chrome.storage.local.get({ [PINNING_DISCLOSURE_SEEN_KEY]: false });
  if (result[PINNING_DISCLOSURE_SEEN_KEY]) return;
  pinningDisclosure.classList.remove("hidden");
  await chrome.storage.local.set({ [PINNING_DISCLOSURE_SEEN_KEY]: true });
}

// ── Rule CRUD ─────────────────────────────────────────────────────────────────

async function removeRule(id: string): Promise<void> {
  pinnedRulesState = pinnedRulesState.filter((r) => r.id !== id);
  renderPinsTable();
  applyPinningEnabledState(autoRedirectCheckbox.checked);
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
    showAddRuleError(`A pin for ${pattern} already exists. Remove it first.`);
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
  renderPinsTable();
  applyPinningEnabledState(autoRedirectCheckbox.checked);
  await saveConfig({ pinnedRules: pinnedRulesState });
}

// ── Other profiles section ────────────────────────────────────────────────────

function setOtherProfilesCollapsed(collapsed: boolean): void {
  otherProfilesSection.classList.toggle("is-collapsed", collapsed);
  otherProfilesToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  otherProfilesToggleLabel.textContent = collapsed ? "Show" : "Hide";
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

// ── Backup & restore ──────────────────────────────────────────────────────────

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
    // fall through
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
  showBackupStatus(`Exported your settings and ${n} pin${n === 1 ? "" : "s"}.`, "success");
}

function rehealDirectory(email: string | undefined, fallback: string): string {
  if (email) {
    const match = allProfiles.find((p) => p.email === email);
    if (match) return match.directory;
  }
  return fallback;
}

function importableRule(value: unknown): PinnedRule | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > 64) return null;
  if (typeof r.pattern !== "string" || !isValidPattern(r.pattern)) return null;
  if (typeof r.targetProfileDirectory !== "string" || !PROFILE_DIR_RE.test(r.targetProfileDirectory)) return null;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return null;
  const email =
    typeof r.targetProfileEmail === "string" && EMAIL_RE.test(r.targetProfileEmail)
      ? r.targetProfileEmail
      : undefined;
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
  if (
    !wrapper ||
    wrapper.type !== BACKUP_TYPE ||
    typeof wrapper.settings !== "object" ||
    wrapper.settings === null
  ) {
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
    typeof s.defaultProfileEmail === "string" && EMAIL_RE.test(s.defaultProfileEmail)
      ? s.defaultProfileEmail
      : null;
  let defaultProfile =
    typeof s.defaultProfile === "string" && PROFILE_DIR_RE.test(s.defaultProfile)
      ? s.defaultProfile
      : null;
  if (defaultProfileEmail) {
    const match = allProfiles.find((p) => p.email === defaultProfileEmail);
    if (match) defaultProfile = match.directory;
  }

  const closeSrc = typeof s.closeSourceTab === "boolean" ? s.closeSourceTab : undefined;
  const pinning = typeof s.urlPinningEnabled === "boolean" ? s.urlPinningEnabled : undefined;
  const dismissed = typeof s.otherResidencesDismissed === "boolean" ? s.otherResidencesDismissed : undefined;

  const n = rules.length;
  if (
    !window.confirm(
      `Import will replace your current settings with ${n} pin${n === 1 ? "" : "s"} from this file. Continue?`
    )
  ) {
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

  // Reflect imported state in UI without a full reload
  pinnedRulesState = rules;
  if (closeSrc !== undefined) {
    closeSourceCheckbox.checked = closeSrc;
    setToggleVisual(closeSourceTrack, closeSrc);
  }
  if (pinning !== undefined) {
    autoRedirectCheckbox.checked = pinning;
    setToggleVisual(autoRedirectTrack, pinning);
  }
  defaultProfileSelect.value = defaultProfile ?? "";
  renderPinsTable();
  applyPinningEnabledState(autoRedirectCheckbox.checked);

  const tail =
    dropped > 0 ? ` (${dropped} invalid pin${dropped === 1 ? "" : "s"} skipped)` : "";
  showBackupStatus(`Imported ${n} pin${n === 1 ? "" : "s"}${tail}.`, "success");
}

// ── Helper card mount ─────────────────────────────────────────────────────────

function mountHelperCard(
  state: HelperState,
  version: string | null,
  onAction: () => void
): void {
  helperStatusMount.replaceChildren();
  const latest = REQUIRED_NMH_VERSION;
  const card = renderHelperStatus({
    state,
    variant: "card",
    ...(version ? { version } : {}),
    ...(state === "outdated" ? { latest } : {}),
    onAction,
  });
  helperStatusMount.appendChild(card);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Load profiles
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

  // Load config
  let otherResidencesDismissed = false;
  try {
    const configResponse = await chrome.runtime.sendMessage({ type: "get_config" });
    if (configResponse?.success && configResponse.config) {
      const cfg = configResponse.config;
      const emailMatch = cfg.defaultProfileEmail
        ? allProfiles.find((p) => p.email === cfg.defaultProfileEmail)
        : undefined;
      if (emailMatch) {
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
        if (defaultProfileSelect.value !== cfg.defaultProfile) {
          await chrome.runtime.sendMessage({ type: "set_config", defaultProfile: null });
        }
      }

      const closeOn = configResponse.config.closeSourceTab ?? false;
      closeSourceCheckbox.checked = closeOn;
      setToggleVisual(closeSourceTrack, closeOn);

      const pinningOn = configResponse.config.urlPinningEnabled === true;
      autoRedirectCheckbox.checked = pinningOn;
      setToggleVisual(autoRedirectTrack, pinningOn);

      pinnedRulesState = Array.isArray(configResponse.config.pinnedRules)
        ? configResponse.config.pinnedRules
        : [];
      otherResidencesDismissed = configResponse.config.otherResidencesDismissed === true;
    }
  } catch {
    // NMH config not available
  }

  renderPinsTable();
  applyPinningEnabledState(autoRedirectCheckbox.checked);

  // Load keyboard shortcut
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

  // Map to HelperState for the shared card renderer
  const helperState: HelperState = !connected
    ? "not-installed"
    : upToDate
    ? "connected"
    : "outdated";

  // Action copies INSTALL_COMMAND to clipboard; falls back to window.prompt.
  const onHelperAction = async (): Promise<void> => {
    const label = helperState === "outdated" ? "Update command copied" : "Install command copied";
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      showToast(label);
    } catch {
      window.prompt("Paste this in Terminal, then restart Chrome:", INSTALL_COMMAND);
    }
  };

  mountHelperCard(helperState, version, () => { void onHelperAction(); });

  // Render a "Download manually →" link below the card when not connected.
  const existingDownloadLink = helperStatusMount.nextElementSibling;
  if (existingDownloadLink?.classList.contains("helper-download-link")) {
    existingDownloadLink.remove();
  }
  if (helperState !== "connected") {
    const downloadLink = document.createElement("a");
    downloadLink.href = NMH_RELEASE_PAGE_URL;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener noreferrer";
    downloadLink.textContent = "Download manually →";
    downloadLink.className = "helper-download-link";
    helperStatusMount.insertAdjacentElement("afterend", downloadLink);
  }

  // Gate pinned-sites UI on NMH version
  applyNmhVersionGate(connected && upToDate);

  if (connected) {
    await initOtherProfilesSection(otherResidencesDismissed);
  }
}

// ── Event wiring ──────────────────────────────────────────────────────────────

// Custom toggles
bindToggleRow(closeSourceTrack, closeSourceCheckbox, (checked) => {
  void saveConfig({ closeSourceTab: checked });
});

bindToggleRow(autoRedirectTrack, autoRedirectCheckbox, async (checked) => {
  applyPinningEnabledState(checked);
  if (checked) await showFirstTimeDisclosureIfNeeded();
  await saveConfig({ urlPinningEnabled: checked });
});

// Default-profile select
defaultProfileSelect.addEventListener("change", () => {
  const dir = defaultProfileSelect.value || null;
  const email = dir ? (allProfiles.find((p) => p.directory === dir)?.email ?? null) : null;
  void saveConfig({ defaultProfile: dir, defaultProfileEmail: email });
});

// Shortcut link
shortcutLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// Add-pin form
addRuleForm.addEventListener("submit", (event) => void handleAddRule(event));
addRulePattern.addEventListener("input", clearAddRuleError);

// Install-all button (§06)
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

// Other profiles toggle + dismiss
otherProfilesToggle.addEventListener("click", () => {
  const collapsed = otherProfilesSection.classList.contains("is-collapsed");
  setOtherProfilesCollapsed(!collapsed);
});

otherProfilesDismissLink.addEventListener("click", (e) => {
  e.preventDefault();
  setOtherProfilesCollapsed(true);
  void saveConfig({ otherResidencesDismissed: true });
});

// Backup & restore
exportBtn.addEventListener("click", () => void exportSettings());
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (file) void importSettings(file);
});

void init();
