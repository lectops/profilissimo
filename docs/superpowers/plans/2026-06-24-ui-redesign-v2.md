# Profilissimo UI Redesign v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement the designer's redesign (popup, settings, onboarding, redirect hand-off, plus a dark theme and consistent "Pin" vocabulary) faithfully into the live extension.

**Architecture:** Vanilla TS/HTML/CSS extension (no framework). The visual source of truth is the committed prototype at `docs/design/Profilissimo.dc.html` — a `.dc.html` template (uses `sc-if`/`sc-for`/`{{ }}`); implementers **translate** it into the extension's plain HTML/CSS/TS, they do not run it. Exact pixel/colour/spacing values must be read from that file per surface.

**Tech Stack:** TypeScript, Vite + @crxjs, vanilla DOM, CSS custom-property tokens in `extension/src/shared/profilissimo.css`. Fonts already vendored via `@fontsource` (Fraunces, Inter Tight, JetBrains Mono) — do NOT add Google Fonts `<link>`s (the prototype uses them; the extension must stay offline/CSP-safe).

## Global Constraints

- **Published product.** No version bumps, tags, or CWS uploads (Alec drives releases). No wire-protocol changes — additive only. Config already uses `pinnedRules` / `urlPinningEnabled`, so the "Pin" vocabulary is **copy-only**.
- **Real values, not prototype placeholders.** The comp shows `profilissimo.app/install` and `profilissimo.app/i`; the real install command is `INSTALL_COMMAND` in `extension/src/utils/constants.ts` (the github curl). Use the real constants everywhere.
- **Vocabulary (resolved):** "Pin / Pinned sites / Pin this site to… / Pin here." Remove all "bound residences / bindings / residence" user-facing copy.
- **Dark mode:** ship via `@media (prefers-color-scheme: dark)` — no setting, no storage. (The prototype's Light/Dark switch was a prototype control only.)
- **macOS only.** Keep Terminal/⌘Q/"this Mac" copy.
- **No test framework.** Verification = `npm run build:extension` (or `build:binary -w native-host` for NMH) + the human reloading the unpacked extension and observing. Subagents cannot drive Chrome — they verify by build + code inspection and explicitly defer in-Chrome checks to the human.
- **Popup width:** 320 → 336px.
- **Branch:** `feature/ui-redesign-v2` (already created off `feature/email-based-profile-targeting`, which contains the merged per-row new-window button).
- **Commits:** no AI attribution / Co-Authored-By lines.

---

### Task 1: Shared design tokens + dark theme

Add the semantic token layer the redesign uses, plus a dark remap. This unblocks every other task and must not break the current screens (which reference the existing tokens — keep them all).

**Files:**
- Modify: `extension/src/shared/profilissimo.css` (`:root` block near the top; add a `@media (prefers-color-scheme: dark)` block)

**Interfaces:**
- Produces (read exact hex from `docs/design/Profilissimo.dc.html` `:root` and `[data-theme="dark"]`): new tokens `--bg, --chrome, --row-hover, --on-ink, --seal-bg, --seal-text, --btn-bg, --btn-text, --rule-soft, --rule-10, --rule-12, --rule-20, --rule-25, --rule-2, --brass-text, --warn-strong, --warn-tint, --warn-text`. (Some like `--warn-tint` already exist — don't duplicate; reconcile to the comp's value if they differ, noting the change.)

- [ ] **Step 1: Add the semantic tokens to `:root`**

Open `docs/design/Profilissimo.dc.html`, copy the full `:root{…}` token list verbatim into the existing `:root` in `profilissimo.css`, **merging** (keep every existing token; add the new ones; where a name collides, prefer the comp's value and note it in the commit body). The light values are the comp's `:root`.

- [ ] **Step 2: Add the dark theme block**

After `:root`, add:
```css
@media (prefers-color-scheme: dark) {
  :root {
    /* paste the comp's [data-theme="dark"] token values here, verbatim */
  }
}
```
Use the exact values from the comp's `[data-theme="dark"]{…}` block.

- [ ] **Step 3: Build**

Run: `npm run build:extension`
Expected: compiles clean; `extension/dist/` rebuilt.

- [ ] **Step 4: Inspection check + commit**

Confirm by inspection that no existing token was removed (current popup/options/onboarding still reference `--paper`, `--ink-*`, `--brass*`, `--success*`, `--danger*`, `--r-*`, fonts — all still present). Defer the in-Chrome light/dark visual check to the human.
```bash
git add extension/src/shared/profilissimo.css
git commit -m "Design tokens: add semantic layer + prefers-color-scheme dark theme"
```

---

### Task 2: Shared HelperStatus renderer

A small reusable renderer for the helper-app status, used by the popup setup state (compact) and the settings helper section (card). Replaces the ad-hoc `nmh-card` markup in options.

**Files:**
- Create: `extension/src/shared/helper-status.ts`
- Create: `extension/src/shared/helper-status.css` (or fold styles into `profilissimo.css` — match existing convention; `profilissimo.css` is the shared sheet, so add a `.helper-status*` block there)
- Test: none (no framework)

**Interfaces:**
- Produces:
  ```ts
  export type HelperState = "not-installed" | "outdated" | "connected";
  export interface HelperStatusOpts {
    state: HelperState;
    variant: "card" | "compact";
    version?: string;   // installed version, for sub-line
    latest?: string;    // latest known version (outdated sub-line)
    path?: string;      // default "~/.profilissimo/bin/profilissimo-nmh"
    onAction?: () => void;
  }
  export function renderHelperStatus(opts: HelperStatusOpts): HTMLElement;
  ```
- State → copy/colour map (from `HelperStatus.dc.html`), exact:
  - `connected`: dot `--success`, ring `--success-tint`, title "Helper connected", sub "v{version} · current", no action.
  - `outdated`: dot `--warn-strong`, ring `--warn-tint`, title "Helper update available", sub "v{version} installed · v{latest} available", action "Update helper" (warn-tinted button).
  - `not-installed`: dot `--danger`, ring `--danger-tint`, title "Helper not installed", sub "Required to open pages in other profiles", action "Install helper" (ink button).
  - `card` variant: dot+ring 11px, title 16px Fraunces italic, sub 11px mono, path line 11px mono `--ink-5`, optional action button on the right. (See `HelperStatus.dc.html` `isCard`.)
  - `compact` variant: dot+ring 9px, title 14px, sub 10.5px mono, no path, no action. (See `isCompact`.)

- [ ] **Step 1: Implement `renderHelperStatus`**

Build the DOM per the two variants and the state map above, using the shared tokens. Read `docs/design/HelperStatus.dc.html` is not committed — use the spec in this task's Interfaces block (it is complete). Pull colours from CSS vars (`--success`, `--warn-strong`, etc.). The action button calls `opts.onAction`.

- [ ] **Step 2: Add `.helper-status` styles to `profilissimo.css`**

Card: flex row, `padding:15px 16px`, `border:1px solid var(--rule)`, `border-radius:14px`, `background:var(--vellum)`. Compact: flex row, gap 10px, no border. Dot: `box-shadow:0 0 0 5px <ring>` (card) / `4px` (compact). Match the comp.

- [ ] **Step 3: Build + commit**

Run: `npm run build:extension` → clean.
```bash
git add extension/src/shared/helper-status.ts extension/src/shared/profilissimo.css
git commit -m "Add shared HelperStatus renderer (card + compact variants)"
```

---

### Task 3: Popup redesign

Reshape the popup to the comp: header, "You're in" strip with a "Pin here" pill, current-page card, helper-outdated banner, "Send this page" section with split rows (move / new-window / pin) + icon legend, single-profile empty state, setup state via HelperStatus compact, loading, transferring, toast. Width 336px. Vocabulary → Pin.

**Files:**
- Modify: `extension/src/popup/popup.html`, `extension/src/popup/popup.css`, `extension/src/popup/popup.ts`
- Reference: `docs/design/Profilissimo.dc.html` (the `sc-if value="{{ isPopup }}"` block) for exact layout/values; reuse existing logic in current `popup.ts`.

**Interfaces:**
- Consumes: existing service-worker messages — `{ type:"transfer", url?, targetProfile, sourceTabId? }` (no url ⇒ new window), `{ type:"get_profiles" }`, `{ type:"health_check" }` (→ `connected`, `version`), `{ type:"get_config" }`/`{ type:"set_config", pinnedRules }`. `REQUIRED_NMH_VERSION`, `isAtLeast`, `hostnameFromUrl`, `uuid`, `applyChip`/`profileAccent`/`profileInitial` (utils/format), `INSTALL_COMMAND`.
- Produces: no new exported interfaces (popup is a leaf).

- [ ] **Step 1: Rewrite `popup.html` structure**

Per the comp's popup block: header (brandmark + settings gear); a `#shell` body containing, in the list state — a "You're in" strip (`#current-strip`: "You're in" + current chip + current name + a `#pin-here-btn` pill on the right), a current-page card (`#current-page-card`), a `#helper-outdated-banner` (hidden by default), a "Send this page" section (eyebrow + italic helper line + `#profile-list` + `#new-window`/`#pin` icon legend), and a footer (shortcut kbd + refresh). Keep separate `#setup-prompt`, `#loading`, `#transfer-state`, `#status` regions (restyled per comp). Remove the old standalone `#pin-section` block (its function moves to the per-row pin button + the "Pin here" pill).

- [ ] **Step 2: Rebuild `popup.css`**

Set `body { width: 336px }`. Translate the comp's popup styles: header gradient + rule; current strip (11px label, 17px current chip, Fraunces current name, the "Pin here" pill with pin glyph and brass hover border); current-page card; helper-outdated warn banner; the split profile row — a flex `<li>` where the left `.profile-row__move` (chip 33px + name + email, click = move, `border-radius:11px 0 0 11px`, hover `--row-hover`) is flanked by a right group of two `.profile-row__icon` buttons (new-window monitor-with-plus SVG, pin SVG), each 30px, opacity 0.5 → 1 on hover, disabled 0.22; the legend row; the empty state card; footer kbd chips. Pull every value from the comp.

- [ ] **Step 3: Rewrite `popup.ts` rendering + handlers**

Rework `renderProfiles` to build the split rows. Click on `.profile-row__move` → existing `transferToProfile` (move tab). New-window button → existing `openNewWindowInProfile` (no-url transfer); gate on `nmhUpToDate`, set disabled + tooltip when outdated. Pin button → `savePin(profile.directory)` (reuse existing pin logic that sets `pinnedRules` via `set_config`); gate when outdated OR the page is non-http(s) (no hostname) — set disabled + tooltip "Pinning works on web pages only". The "Pin here" pill pins the current page to the current profile (same `savePin` with current directory), shown only when `canPinCurrent` (helper current AND http(s) page). Show the helper-outdated banner when `!nmhUpToDate`. Toast copy: "Moved this tab to X", "Opened a new window in X", "Pinned {host} → {name}" (append " · auto-redirect is off" when `urlPinningEnabled` is false — read from config). Empty/single-profile state → "Set up other profiles →" opens options. Keep loading/transfer/error behavior; restyle transfer label to "moving".

- [ ] **Step 4: Build**

Run: `npm run build:extension` → clean (watch the `renderProfiles` call sites and removed pin-section element refs — delete dead `pin-*` DOM lookups).

- [ ] **Step 5: Inspection check + commit**

Confirm by inspection: three actions wired (move/new-window/pin), version + non-http gating applied, "Pin here" pill gating, no references to removed elements. Defer in-Chrome verification to the human (see Verification Checklist at bottom).
```bash
git add extension/src/popup/
git commit -m "Popup: redesign to v2 (split rows, pin pill, helper status, dark)"
```

---

### Task 4: Settings redesign

Restructure the options page to the comp: a "Contents" TOC sidebar; sections grouped under "Preferences" (01 Default profile, 02 Behavior, 03 Pinned sites) and "Setup & maintenance" (04 The helper app, 05 Backup & restore, 06 Other profiles); numbered 01–06; "synced" / "this Mac only" pills; custom toggles; pins table; HelperStatus card; dark via tokens. Vocabulary → Pin.

**Files:**
- Modify: `extension/src/options/options.html`, `options.css`, `options.ts`
- Reference: comp's `sc-if value="{{ isSettings }}"` block. (Ignore the browser-chrome tab framing — that's prototype decoration.)

**Interfaces:**
- Consumes: existing options logic + messages (`get_config`/`set_config`, profiles, export/import, install-all). `renderHelperStatus` from Task 2 for §04.
- Produces: none.

- [ ] **Step 1: Rewrite `options.html`** to the two-column layout (TOC `nav` + content), section ids `#sec-default #sec-behavior #sec-pins #sec-helper #sec-backup #sec-other`, group eyebrows "Preferences" / "Setup & maintenance", numeric `01`–`06` labels, pills ("synced"/"this Mac only"). Rename "Bound residences" → "Pinned sites", body copy "Sites that always open in one profile, wherever you click them.", toggle label "Auto-redirect pinned sites", empty state references right-click "Pin this site to…", add-form button "Pin". §04 helper app hosts a mount point for `renderHelperStatus({variant:"card"})`. Keep export/import and other-profiles markup, restyled.
- [ ] **Step 2: Rebuild `options.css`** per the comp (TOC nav, section headings with mono numbers, brass group eyebrows, custom toggle track/thumb, pins table, dashed empty state, buttons). Pull values from comp.
- [ ] **Step 3: Update `options.ts`** — swap the helper section to call `renderHelperStatus` with the detected state/version (map current nmh detection → `HelperState`); update any user-facing strings to the Pin vocabulary; wire the TOC anchor links; keep all existing behavior (default profile, toggles, pins CRUD, export/import, install-all, dismiss). Update the "pinning needs update" callout to point at `#sec-helper`.
- [ ] **Step 4: Build** `npm run build:extension` → clean.
- [ ] **Step 5: Commit**
```bash
git add extension/src/options/ extension/src/shared/
git commit -m "Settings: redesign to v2 (TOC, grouped sections, Pin vocabulary, dark)"
```

---

### Task 5: Onboarding redesign

Reshape onboarding to the comp: hero, steps I–III with the realistic Terminal block and "Safe to run" reassurance callout, success Branch A (celebrate) and Branch B (other profiles), Pin vocabulary in the P.S.

**Files:**
- Modify: `extension/src/onboarding/onboarding.html`, `onboarding.css`, `onboarding.ts`
- Reference: comp's `sc-if value="{{ isOnboarding }}"` block.

**Interfaces:**
- Consumes: existing onboarding logic (check connection, branch selection, install-all, copy command using `INSTALL_COMMAND`).
- Produces: none.

- [ ] **Step 1: Rewrite `onboarding.html`** — hero (seal+halo, est. 2026, title, italic tagline, connected pill); Step I install with Terminal-window block (titlebar traffic lights + "Terminal" label, `$` prompt, the **real** `INSTALL_COMMAND`, Copy button) and a "Safe to run" callout (shield icon, "no admin password, no system changes", manual-download link); Step II restart (⌘Q kbd); Step III verify (Check connection); Branch A celebrate + P.S. "Pin this site to…"; Branch B "Step IV — and last" + profile list + install-all + skip.
- [ ] **Step 2: Rebuild `onboarding.css`** per comp.
- [ ] **Step 3: Update `onboarding.ts`** — keep all behavior; ensure the copy button copies `INSTALL_COMMAND`; update P.S. copy to Pin vocabulary. Branch A/B selection unchanged.
- [ ] **Step 4: Build** → clean. **Step 5: Commit** `git commit -m "Onboarding: redesign to v2 (Terminal block, safe-to-run, Pin vocabulary)"`

---

### Task 6: Copy alignment + redirect hand-off page

Align the remaining surfaces to the Pin vocabulary, and rebuild the redirect interstitial as the designed hand-off moment.

**Files:**
- Modify: `extension/src/background/service-worker.ts` (context-menu titles + notification copy)
- Modify: `extension/public/redirect.html`, `extension/public/redirect.js`
- Reference: comp's notification block + `isInterstitial` block.

**Interfaces:**
- Consumes: existing menu/notification/redirect logic.
- Produces: none.

- [ ] **Step 1: Context menu + notification copy** in `service-worker.ts`:
  - "Always open this site in…" → **"Pin this site to…"** (parent + the single-profile flat variant).
  - Notification: title "Profilissimo: pin didn't fire" → **"A pin didn't fire"**; body → "Couldn't open {pattern} in {profile} — {reason}." style; keep it pointing users to Settings → Pinned sites (button/copy "Open Pinned sites" where applicable). Do NOT change menu IDs or message shapes — copy only.
- [ ] **Step 2: Redirect hand-off** — rebuild `redirect.html` + `redirect.js` as the comp's `isInterstitial` moment: from-chip → animated dots → to-chip (with neon halo), "Handing off to {profile}…", "Opening {url} in your {profile} profile.", a progress bar. The page already receives the target URL via `?to=`; surface profile/url where available, fall back gracefully if params are absent, and keep the existing auto-navigate behavior/timing (do not slow the redirect down materially — the visual is a brief calm beat, not a gate).
- [ ] **Step 3: Build** (`npm run build:extension`) → clean. Confirm menu/notification still function (IDs unchanged). **Step 4: Commit** `git commit -m "Copy: Pin vocabulary in menus + notifications; redesign redirect hand-off"`

---

## Self-Review

**Spec coverage** (comp → task): popup → T3; settings → T4; onboarding → T5; HelperStatus component → T2; tokens + dark theme → T1; notification + context-menu copy → T6; redirect hand-off → T6; Pin vocabulary → T3/T4/T5/T6. ✓
**Placeholder scan:** exact values are delegated to the committed `docs/design/Profilissimo.dc.html` (named per task) plus the inline HelperStatus spec; no "TBD". ✓
**Type consistency:** `renderHelperStatus`/`HelperState`/`HelperStatusOpts` defined in T2, consumed by T3 (compact) and T4 (card). Message shapes unchanged from the existing service worker. ✓
**Constraint check:** no wire change (Pin is copy-only; config already `pinnedRules`); real `INSTALL_COMMAND` not prototype URL; dark via `prefers-color-scheme`; no Google Fonts links. ✓

## Verification Checklist (human, in Chrome — per surface)

After each surface's PR: reload the unpacked extension (rebuild the NMH only if its binary changed — it doesn't in this plan).
- **Popup:** light + dark (toggle macOS appearance); move-tab via row body; new-window icon (and disabled when helper outdated); pin icon (and disabled on chrome:// pages); "Pin here" pill; single-profile empty state; setup state when helper absent; loading/transfer/toast.
- **Settings:** TOC anchors scroll; toggles persist; pins add/remove; helper card shows correct state/version; export/import; other-profiles collapse/dismiss; dark.
- **Onboarding:** Terminal copy copies the real command; verify-connection flow; Branch A vs B; dark.
- **Menus/notification:** context menu reads "Pin this site to…"; a failed pin shows the new copy.
- **Redirect:** trigger a `chrome://` transfer; confirm the hand-off page shows briefly then navigates.
