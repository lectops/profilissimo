# Task 4 Report: Settings Redesign v2

## Structure Changes

### Layout
- **Before:** Single-column `.page` card, sections stacked vertically with `§ I.–VI.` roman/italic numbering.
- **After:** Two-column layout. Left: `<nav class="toc">` (208px, `var(--paper)` bg, `border-right:1px solid var(--rule-10)`). Right: `.settings-content` column with flex `1`. Both columns live inside `.settings-layout` which is the outer card (`max-width:920px`, `border-radius:14px`, `box-shadow:0 30px 60px -30px rgba(0,0,0,.4)`).

### TOC Nav
Six links organized under two brass group eyebrows ("Preferences" / "Setup & maintenance"). Link nums use `.toc__num` (mono, `--ink-5`). Links anchor-scroll to the section IDs.

### Section numbering
Old `§ I.` italic roman numerals → new `01`–`06` mono numbers in `.section__num` (`font-family:var(--mono); font-size:12px; color:var(--ink-5)`). Section titles are now 18px Fraunces weight 500, matching comp.

### Group eyebrows
Two `.section-group-eyebrow` blocks (10px uppercase, `--brass`, `font-weight:600`): "Preferences" before §01, "Setup & maintenance" after a `.section-group-divider` (1px `--rule`).

### Pills
- "shared across profiles" → "synced" (`pill--brass`) on §01, §02, §03, §05.
- "this Mac only" → `pill--mac` (new class: `background:var(--paper-2); color:var(--ink-3)`) on §04.

## Behavior Preservation

### §01 Default profile
All logic unchanged. `defaultProfileSelect` ID unchanged. Email-heal-on-load, save-on-change, shortcut label + link all rewired identically.

### §02 Behavior (close-source-tab)
Old: `<label>` + hidden `<input type="checkbox">` driving CSS `:checked` track. New: custom visual toggle (`toggle-track` + `toggle-thumb` driven by `.is-on` class) + hidden `toggle-input` for a11y keyboard use. `bindToggleRow()` wires the row click + checkbox `change` event both to `setToggleVisual()` + `saveConfig()`. Same config key `closeSourceTab`.

### §03 Pinned sites ("Bound residences" → "Pinned sites")
- Copy: "Sites that always open in one profile, wherever you click them."
- Empty state: references right-click "Pin this site to…"
- Warn banner (`pinning-needs-update`): now styled as `.warn-banner` (dot + text, `--warn-tint` bg, links to `#sec-helper`).
- Auto-redirect toggle: same custom toggle pattern as §02. Config key `urlPinningEnabled` unchanged.
- Disclosure text: "Profilissimo checks pages you open against your pins. Nothing leaves this Mac." Shown on first enable (same `PINNING_DISCLOSURE_SEEN_KEY` logic).
- Pins table: replaced `<table>` with CSS-flex rows (`.pins-table-wrap`, `.pins-row`). Same sort-by-createdAt, same profile-chip via `applyChip()`, same email-fallback lookup via `profileLookupForRule()`. Remove button now uses a trash SVG icon (28×28, hover `--danger-tint`).
- Add form: hostname input + profile select + "Pin" button (was "Bind"). IDs `add-rule-pattern`, `add-rule-profile`, `add-rule-btn` unchanged. Error msg id `add-rule-error` unchanged.
- NMH gate: `applyNmhVersionGate()` still hides `#pinning-section-body` / shows `#pinning-needs-update` when helper is outdated/missing.

### §04 The helper app
Old: ad-hoc `.nmh-card` with manual `nmhIndicator`/`nmhText`/`nmhVersion`/`nmhAction` DOM manipulation.
New: mounts `renderHelperStatus({ state, variant:"card", version, latest, onAction })` from Task 2's shared renderer into `#helper-status-mount`. 

**State mapping:**
- `!connected` → `HelperState = "not-installed"` (dot `--danger`)
- `connected && !upToDate` → `HelperState = "outdated"` (dot `--warn-strong`; `latest = REQUIRED_NMH_VERSION`)
- `connected && upToDate` → `HelperState = "connected"` (dot `--success`)

**Action handler:** `onHelperAction` calls `window.prompt()` with `INSTALL_COMMAND` (same copy-install behavior as before, now surfaced via the card button). `NMH_RELEASE_PAGE_URL` is kept in scope (not dead-code-eliminated).

### §05 Backup & restore
Copy: "Pins are matched by account email…" (was "Bindings"). Export success message: "Exported your settings and N pin(s)." Import confirm dialog: "…N pin(s) from this file…". Import success: "Imported N pin(s) (M invalid pin(s) skipped)". Config keys unchanged. Button IDs `export-btn`/`import-btn`/`import-file`/`backup-status` unchanged.

### §06 Other Chrome profiles
Old: `.section--collapsed` class. New: `.is-collapsed` class (same toggle behavior, different class name to match the new card structure). `setOtherProfilesCollapsed()` updated accordingly. Section starts `hidden`, revealed by `initOtherProfilesSection()` same as before. Dismiss link writes `otherResidencesDismissed:true` to config same as before. "Other residences" → "Other Chrome profiles" (title). Install list rows now match comp styling (10px vs 14px chips, profile name Fraunces 14.5px, email mono 10.5px, "Add to Chrome" ghost button via `renderInstallList` which creates its own markup — not changed).

### Saved toast
Old: `.save-status` with CSS `animation: save-bob`. New: `.save-toast` with `animation: save-rise`. Functionally identical (show/hide on 1500ms timer). ID `save-status` unchanged.

## Deleted Elements

These old elements/classes were removed and their handlers replaced:
- `.nmh-card`, `.nmh-card__indicator`, `.nmh-card__body`, `.nmh-card__title`, `.nmh-card__version`, `.nmh-card__path`, `.nmh-card__action` — replaced by `renderHelperStatus` card mount.
- `#nmh-indicator`, `#nmh-text`, `#nmh-version`, `#nmh-action` DOM refs.
- `createCopyButton()`, `createDownloadLink()`, `renderNmhAction()` functions.
- Old `NmhState` local type — replaced by `HelperState` from shared module.
- `UNINSTALL_COMMAND` import — not surfaced in the new design (helper card only has install/update action).
- Old `<table>` rules markup (`#rules-table`, `#rules-tbody`, `.rules__table`, `.rules__pattern`, `.rules__target`, etc.).
- Old `.pinning-body.disabled` class (replaced by `.is-disabled`).
- `#pinning-body` class toggle from `disabled` to `is-disabled`.
- Old `.section--collapsed` used for §06 (replaced by `.is-collapsed`).
- `brandmark` header block (not in new comp layout).
- `page__footer` / `ornament` classes (replaced by `settings-footer`).
- `save-status` / `save-bob` (replaced by `save-toast` / `save-rise`).

## Judgment Calls

1. **`window.prompt()` for helper action**: The comp shows a button that "installs" but has no spec for what happens in the extension UI. The old code used copy-to-clipboard buttons. I used `window.prompt()` which pre-fills the command for easy copy — preserves intent without needing a full command-display UI. This matches what the old `createCopyButton` did, just via prompt rather than clipboard.

2. **`renderInstallList` unchanged**: The `multi-profile-install.ts` utility creates its own `<li>` DOM structure (profile rows with "Add to Chrome" buttons + status). I left it untouched since it's a shared utility and its output renders into `.install-list` correctly with the new CSS.

3. **`NMH_RELEASE_PAGE_URL` kept live**: Used a `void NMH_RELEASE_PAGE_URL` to prevent the TypeScript unused-import error while keeping the import available for future use (the plan says the new design doesn't explicitly surface the download link, but the constant should not be removed from the module).

4. **Toggle a11y**: The hidden `<input type="checkbox">` is positioned absolutely over the track for keyboard/screen-reader operation. Click on the `.toggle-row` flips it visually + functionally; the real checkbox change event also fires `setToggleVisual`. Both code paths call the same save handler.

5. **`#sec-other` TOC anchor**: The section element has `id="other-profiles-section"` (used by JS). The TOC link now points to `#other-profiles-section` rather than a separate `#sec-other`. Both the anchor scroll and the JS `$()` lookup use the same id.
