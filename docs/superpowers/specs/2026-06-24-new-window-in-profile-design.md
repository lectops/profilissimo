# Design: "Open new window in profile" from the popup

Date: 2026-06-24
Branch: feature/email-based-profile-targeting (or a fresh feature branch)

## Goal

From the toolbar popup, let the user open a **new empty Chrome window** in any
profile, regardless of which profile they're currently in. UX: click the
Profilissimo "P", then click a per-row "new window" button on the chosen
profile, and a fresh window opens in that profile.

This is additive to the existing per-row behavior (single-click a profile =
move the current tab's URL into that profile).

## Background / current state

The backend already supports this; the popup just never exposes a no-URL path.

- `extension/src/background/service-worker.ts` `handleTransfer(url, targetProfile, sourceTabId)`:
  - **Branch 1** (a transferable URL is present): calls NMH `open_url`.
  - **Branch 2** (no URL / `javascript:` URL): calls NMH `open_profile`, which
    opens a fresh window in the target profile. Gated on
    `nmhSupportsExtendedTransfer` (NMH ≥ `REQUIRED_NMH_VERSION` = `1.1.0`).
- The internal `transfer` message already declares `url` optional. Omitting it
  is the documented way to route to `open_profile`.
- NMH `open_profile` (`native-host/src/main.ts`) calls
  `launchInProfile(undefined, targetProfile)` →
  `launcher.ts` spawns Chrome with `["--profile-directory=X"]` (no URL).
- The popup (`extension/src/popup/popup.ts`) always sends the active tab's
  `url` in its `transfer` message, so it never reaches Branch 2.
- `loadProfiles()` already computes `nmhUpToDate = isAtLeast(version, REQUIRED_NMH_VERSION)`
  but currently only uses it to gate the pin section.

So the feature is mostly a popup UI addition, plus one launcher tweak to make
"new window" deterministic.

## Non-goals

- No wire-protocol change. No new NMH action, no new message type, no new
  config field. `open_profile` + the optional-`url` `transfer` message already
  cover it.
- No context-menu entry for "new window" (popup-only for now). YAGNI.
- No change to the URL-transfer path or its window/tab behavior.

## Design

### 1. Popup UI — per-row "new window" button

File: `extension/src/popup/popup.ts`, `popup.css`, `popup.html` (if markup needed).

- In `renderProfiles(profiles, currentEmail)`, give **every** row a secondary
  icon button (a "new window" / plus-square glyph) on the trailing edge:
  - For **non-current** rows: the row keeps its existing single-click /
    Enter/Space handler = `transferToProfile` (move tab). The new button is an
    additional, separate target.
  - For the **current** row (`profile-row--current`, today non-interactive):
    add the new-window button. Opening a fresh window in your own profile is
    valid, so the current row is no longer fully inert.
- The button handler calls a new `openNewWindowInProfile(profile)` and MUST
  call `e.stopPropagation()` (and not bubble to the row), so clicking it never
  also triggers the move-tab handler.
- Button needs an accessible label, e.g. `aria-label="Open new window in <profile.name>"`.

### 2. `openNewWindowInProfile(profile)` handler

File: `extension/src/popup/popup.ts`.

- Guard against double-fire using the existing `transferring` flag (or a shared
  `busy` flag).
- Send `chrome.runtime.sendMessage({ type: "transfer", targetProfile: profile.directory })`
  with **no `url`** and **no `sourceTabId`** (we are not moving or closing any tab).
- On `response.success`: show a brief status toast
  (e.g. `Opening new window in <profile.name>`) then `window.close()` after a
  short delay (mirror the existing ~700ms close).
- On failure: show an error status toast; keep the popup open. (On a stale NMH
  the service worker's Branch 2 returns the "Update the helper app…" message,
  but see gating below — the button shouldn't appear there in the first place.)
- The "from → to" transfer animation (`showTransferring`) is about moving a
  tab; do NOT reuse it here. A status toast is the right weight for new-window.

### 3. Version gating

File: `extension/src/popup/popup.ts`.

- `open_profile` requires NMH ≥ 1.1.0. Pass the already-computed `nmhUpToDate`
  into `renderProfiles` and render the new-window button **only when true**.
- When the NMH is older (1.0.0): no new-window button. Move-tab for http(s)
  still works (that's the original 1.0.0 `open_url` path), so existing users
  on the published NMH are not broken and lose nothing they had before.

### 4. NMH launcher — deterministic new window

File: `native-host/src/launcher.ts`.

- Today the no-URL branch is:
  `args = ["--profile-directory=X"]`.
  When Chrome is already running that profile, relaunching may just focus the
  existing window rather than open a new one.
- Change the **no-URL branch only** to:
  `args = ["--profile-directory=X", "--new-window"]`.
  The URL branch (`["--profile-directory=X", "--", url]`) is unchanged.
- Rationale and safety:
  - Makes "open a new window" deterministic, matching the feature's promise.
  - Only affects `open_profile` (a 1.1.0-era action). The published 1.0.0
    extension never calls `open_profile`, so a new NMH against the old
    extension is unaffected.
  - A new extension against the old 1.0.0 NMH never reaches this code (button
    is version-gated off), so no regression there either.

## Rollout / compatibility (per CLAUDE.md constraints)

- **New extension + published 1.0.0 NMH:** new-window button hidden (gated on
  ≥1.1.0). Existing move-tab behavior intact. No breakage.
- **New NMH + published 1.0.0 extension:** 1.0.0 extension only calls
  `open_url`; `--new-window` change is in the no-URL path it never triggers.
  No breakage.
- No version bumps, tags, or CWS uploads as part of this work — Alec drives
  release cadence. `CHANGELOG.md` `[Unreleased]` should get an "Added" entry in
  the same PR.

## Testing

Manual (no test framework configured):

1. Rebuild NMH binary (`npm run build:binary -w native-host`) and extension
   (`npm run dev` / reload unpacked).
2. With the target profile **not running**: click the new-window button →
   a new window opens in that profile.
3. With the target profile **already running**: click the new-window button →
   a genuinely **new** window opens (not just focus of the existing one). This
   is the case that validates the `--new-window` flag.
4. New-window button on the **current** profile row opens a new window in the
   current profile.
5. Clicking the new-window icon does **not** also move the current tab (verify
   `stopPropagation`).
6. Move-tab (row click) still works unchanged for http(s) pages.
7. Simulate a stale NMH (or test against 1.0.0): new-window button is absent;
   move-tab still works for http(s).

## Files touched

- `extension/src/popup/popup.ts` — render button, new handler, gating.
- `extension/src/popup/popup.css` — button styles.
- `extension/src/popup/popup.html` — only if static markup is required (likely
  not; rows are built in JS).
- `native-host/src/launcher.ts` — add `--new-window` to no-URL args.
- `CHANGELOG.md` — `[Unreleased]` Added entry.
