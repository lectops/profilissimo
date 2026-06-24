# Open New Window in Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-row "new window" button to the toolbar popup that opens a fresh empty Chrome window in any profile, regardless of the current profile.

**Architecture:** Popup-only UX addition plus one NMH launcher tweak. The popup's existing `transfer` message already routes to the NMH `open_profile` action when `url` is omitted; the new button simply sends that message with no URL. The launcher gains `--new-window` on its no-URL path so the window is deterministically new rather than a focus of an existing one. No wire-protocol change.

**Tech Stack:** TypeScript, Vite + @crxjs (extension), Bun-compiled NMH binary, vanilla DOM (no framework in popup), CSS custom-property design tokens.

## Global Constraints

- **No test framework is configured.** Verification is manual (build + reload + observe). Do NOT add a test runner. (`CLAUDE.md`)
- **No wire-protocol changes.** No new NMH action, message type, or config field. Additive only. (`CLAUDE.md`)
- **NMH version floor for this feature:** `REQUIRED_NMH_VERSION = "1.1.0"` (already defined in `extension/src/utils/constants.ts`). `open_profile` and no-URL transfers require it.
- **Do not bump versions, tag, or upload to CWS.** Alec drives releases. (`CLAUDE.md`)
- **Rollout safety:** new extension must still work against published 1.0.0 NMH (button hidden when NMH < 1.1.0); new NMH must still work against published 1.0.0 extension (the `--new-window` change is on a code path the 1.0.0 extension never triggers).
- **Branch:** `feature/new-window-in-profile` (already created off the email-targeting branch; spec already committed).
- **Commit style:** no AI attribution / Co-Authored-By lines. (user global instructions)

---

### Task 1: NMH launcher opens a deterministically new window

Make the no-URL launch path pass `--new-window` so `open_profile` always opens a new window even when the target profile is already running.

**Files:**
- Modify: `native-host/src/launcher.ts:62-64`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change. `launchInProfile(undefined, dir)` now spawns Chrome with `["--profile-directory=<dir>", "--new-window"]`. `launchInProfile(url, dir)` is unchanged.

- [ ] **Step 1: Make the change**

In `native-host/src/launcher.ts`, the current args construction is:

```typescript
  const args = url
    ? [`--profile-directory=${profileDirectory}`, "--", url]
    : [`--profile-directory=${profileDirectory}`];
```

Change the no-URL branch to add `--new-window`:

```typescript
  const args = url
    ? [`--profile-directory=${profileDirectory}`, "--", url]
    : [`--profile-directory=${profileDirectory}`, "--new-window"];
```

Leave the surrounding comment intact; optionally extend it to note that `--new-window` forces a fresh window rather than focusing an existing one.

- [ ] **Step 2: Build the NMH binary**

Run: `npm run build:binary -w native-host`
Expected: completes without error; `native-host/bin/profilissimo-nmh` is rebuilt. (Requires Bun.)

- [ ] **Step 3: Manual verification — new window when profile already running**

Re-register / use the locally-built binary (the dev manifest at `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.profilissimo.nmh.json` should already point at it). Then, from a quick manual trigger of `open_profile` against a profile that **already has a window open**, confirm a **second, new** window opens for that profile (not just a focus of the existing one).

You can trigger it the same way the popup will in Task 2, so it's acceptable to defer this exact check until Task 2's manual verification. If verifying standalone now: temporarily send an `{ "action": "open_profile", "targetProfile": "<dir>" }` message through the NMH, or just confirm the code change and validate end-to-end in Task 2.
Expected: a brand-new window appears in the target profile.

- [ ] **Step 4: Commit**

```bash
git add native-host/src/launcher.ts
git commit -m "NMH: open a new window (not focus) for no-URL launches"
```

---

### Task 2: Popup "new window" button, handler, and version gating

Add the per-row button, its handler, and gate it on NMH ≥ 1.1.0. Also add the CHANGELOG entry.

**Files:**
- Modify: `extension/src/popup/popup.ts` (renderProfiles signature + call site, new `openNewWindowInProfile` + `createNewWindowButton`)
- Modify: `extension/src/popup/popup.css` (button styles)
- Modify: `CHANGELOG.md` (`[Unreleased]` → `### Added`)

**Interfaces:**
- Consumes from Task 1: NMH `open_profile` now opens a new window. From existing code: the internal `transfer` message (`{ type: "transfer", targetProfile, url? }`) routes to `open_profile` when `url` is absent (`service-worker.ts` Branch 2); `transferring` module flag; `showStatus(message, type)`; `nmhUpToDate` boolean computed in `loadProfiles`.
- Produces: `function openNewWindowInProfile(profile: ProfileInfo): Promise<void>`; `function createNewWindowButton(profile: ProfileInfo): HTMLButtonElement`; `renderProfiles(profiles: ProfileInfo[], currentEmail: string | null | undefined, nmhUpToDate: boolean)`.

- [ ] **Step 1: Add the `openNewWindowInProfile` handler**

In `extension/src/popup/popup.ts`, add this function near `transferToProfile` (it reuses the existing module-level `transferring` flag and `showStatus`):

```typescript
async function openNewWindowInProfile(profile: ProfileInfo): Promise<void> {
  if (transferring) return;
  transferring = true;

  try {
    // No `url` and no `sourceTabId`: the service worker routes this to the NMH
    // open_profile action, which opens a fresh window in the target profile.
    // We are not moving or closing any tab.
    const response = await chrome.runtime.sendMessage({
      type: "transfer",
      targetProfile: profile.directory,
    });

    if (response?.success) {
      showStatus(`Opening new window in ${profile.name}`, "success");
      setTimeout(() => window.close(), 700);
    } else {
      showStatus(response?.error ?? "Couldn't open a new window", "error");
    }
  } catch {
    showStatus("Couldn't open a new window", "error");
  } finally {
    transferring = false;
  }
}
```

- [ ] **Step 2: Add the `createNewWindowButton` helper**

In `extension/src/popup/popup.ts`, add this function (also near `renderProfiles`). The click handler calls `stopPropagation()` so it never triggers the row's move-tab handler; the keydown guard stops Enter/Space from bubbling to non-current rows' keydown handler:

```typescript
function createNewWindowButton(profile: ProfileInfo): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "profile-row__new-window";
  btn.setAttribute("aria-label", `Open new window in ${profile.name}`);
  btn.title = `New window in ${profile.name}`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "15");
  svg.setAttribute("height", "15");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "2.5");
  rect.setAttribute("y", "2.5");
  rect.setAttribute("width", "11");
  rect.setAttribute("height", "11");
  rect.setAttribute("rx", "2.5");
  rect.setAttribute("stroke", "currentColor");
  rect.setAttribute("stroke-width", "1.25");

  const plus = document.createElementNS("http://www.w3.org/2000/svg", "path");
  plus.setAttribute("d", "M8 5.5v5M5.5 8h5");
  plus.setAttribute("stroke", "currentColor");
  plus.setAttribute("stroke-width", "1.25");
  plus.setAttribute("stroke-linecap", "round");

  svg.appendChild(rect);
  svg.appendChild(plus);
  btn.appendChild(svg);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    void openNewWindowInProfile(profile);
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  });

  return btn;
}
```

- [ ] **Step 3: Thread `nmhUpToDate` into `renderProfiles` and append the button**

In `extension/src/popup/popup.ts`, change the signature (currently `function renderProfiles(profiles: ProfileInfo[], currentEmail?: string | null): void {`) to:

```typescript
function renderProfiles(profiles: ProfileInfo[], currentEmail: string | null | undefined, nmhUpToDate: boolean): void {
```

Then, inside the `profiles.forEach(...)` loop, **after** the existing `if (isCurrent) { ... } else { ...caret... }` block and **before** `profileList.appendChild(li);`, append the button when the NMH supports it:

```typescript
    if (nmhUpToDate) {
      li.appendChild(createNewWindowButton(profile));
    }
```

Update the call site (currently `renderProfiles(response.profiles, currentEmail);` inside `loadProfiles`) to pass the already-computed `nmhUpToDate`:

```typescript
      renderProfiles(response.profiles, currentEmail, nmhUpToDate);
```

(`nmhUpToDate` is computed earlier in `loadProfiles` as `isAtLeast(healthResponse.version, REQUIRED_NMH_VERSION)`.)

- [ ] **Step 4: Add button styles**

In `extension/src/popup/popup.css`, add after the `.profile-row__caret` rule (around line 174):

```css
.profile-row__new-window {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-4);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.profile-row__new-window:hover {
  background: var(--paper-3);
  color: var(--ink);
}

.profile-row__new-window:focus-visible {
  outline: 2px solid var(--brass-2);
  outline-offset: -2px;
}

/* The current-profile row is dimmed (opacity 0.55); keep its new-window button
   legible enough to read as actionable. */
.profile-row--current .profile-row__new-window {
  color: var(--ink-3);
}
```

- [ ] **Step 5: Build the extension**

Run: `npm run build:extension`
Expected: TypeScript compiles with no errors; `extension/dist/` is rebuilt. (Type errors here usually mean the `renderProfiles` signature change wasn't applied at the call site.)

- [ ] **Step 6: Manual verification**

Reload the unpacked extension at `chrome://extensions` (with the Task 1 NMH binary registered). Verify all of:

1. Each profile row shows the new-window (⊞) button on its right edge, **including** the current ("you are here") row.
2. Clicking the ⊞ on a **non-current** profile opens a new window in that profile and does **not** move/transfer the current tab.
3. Clicking the ⊞ on the **current** profile opens a new window in the current profile.
4. With the target profile **already running**, clicking ⊞ opens a genuinely **new** window (validates Task 1's `--new-window`).
5. Clicking a profile **name/row** (not the ⊞) still moves the current tab as before.
6. Keyboard: Tab to the ⊞ button, press Enter → new window opens; the row's move-tab action does not also fire.

Expected: all six behaviors hold.

- [ ] **Step 7: Manual verification — version gating (best effort)**

If a 1.0.0 NMH is available, point the dev manifest at it and reload: the ⊞ buttons should be **absent**, and clicking a profile name should still move http(s) tabs. If a 1.0.0 NMH isn't readily available, confirm by code inspection that the button is only appended under `if (nmhUpToDate)` and note it as inspection-verified.
Expected: no ⊞ buttons when NMH < 1.1.0; move-tab still works.

- [ ] **Step 8: Add CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add a bullet:

```markdown
- Each profile in the toolbar popup now has a "new window" button that opens a fresh empty window in that profile, regardless of which profile you're currently in (no tab is moved). Requires the updated helper app; the button is hidden if the helper app is older than this extension expects.
```

- [ ] **Step 9: Commit**

```bash
git add extension/src/popup/popup.ts extension/src/popup/popup.css CHANGELOG.md
git commit -m "Popup: add per-profile 'new window' button"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 (per-row button, current row included, stopPropagation) → Task 2 Steps 2–4. ✓
- Spec §2 (`openNewWindowInProfile`, no URL, status toast, no transfer animation) → Task 2 Step 1. ✓
- Spec §3 (version gating on `nmhUpToDate`) → Task 2 Step 3 + Step 7. ✓
- Spec §4 (launcher `--new-window` on no-URL path only) → Task 1. ✓
- Spec rollout/compat → Global Constraints + Task 1 Step 3 / Task 2 Step 7. ✓
- Spec testing items → Task 2 Step 6 (six checks) + Task 1 Step 3. ✓
- Spec "files touched" → covered; `popup.html` correctly untouched (rows are built in JS). ✓
- CHANGELOG `[Unreleased]` Added entry → Task 2 Step 8. ✓

**Placeholder scan:** No TBD/TODO/"add error handling" placeholders. All code steps show full code. ✓

**Type consistency:** `renderProfiles(profiles, currentEmail, nmhUpToDate)` signature matches its single call site update; `openNewWindowInProfile(profile: ProfileInfo)` and `createNewWindowButton(profile: ProfileInfo)` names/types are consistent across steps. `transfer` message shape (`type`, `targetProfile`, optional `url`) matches `service-worker.ts` `isValidMessage`. ✓
