# Onboarding multi-profile prominence + options-page entry point

**Date:** 2026-04-30
**Status:** Approved (verbal)
**Issue:** #1 — Simplify extension installation across multiple Chrome profiles during onboarding

## Problem

The current onboarding flow shows a "You're all set!" celebration with a 72px green check badge as soon as the helper app is verified, even when the user has more profiles to install Profilissimo into. The multi-profile install step is then rendered *below* this celebration, making it read as optional/bonus when it's actually the last required step. Users miss it entirely.

Additionally, users who close onboarding before completing the multi-profile step have no way to return to it later — the options page currently only has a static tip card pointing them at the install step they already missed.

## Goals

1. When there are ≥1 other profiles to install in, frame the multi-profile step as the user's primary remaining task. Don't celebrate prematurely.
2. Provide a discoverable, always-available control on the options page so skipping during onboarding isn't terminal.
3. No new permissions, no NMH wire-protocol changes (per CLAUDE.md release discipline).

## Non-goals

- Cross-profile detection of which profiles already have the extension (deferred — issue #1 leaves this open).
- Persisted "I marked this as done" tracking. The button is idempotent (just opens CWS pages); tracking adds state for no real gain.
- Changes to the existing 3-step setup flow (helper app install → restart → verify).

## Design

### Onboarding — split the success state by branch

After the helper-app verification succeeds, branch on `otherProfiles.length`:

**Branch A — `otherProfiles.length === 0` (zero or one Chrome profile total).** Show the existing "You're all set!" badge + "Get Started" button. The work really is done.

**Branch B — `otherProfiles.length >= 1`.** Render a redesigned "Step 4" view:

- Header logo shrinks 72px → 40px; vertical margin tightens accordingly
- The 72px green-check success badge is omitted entirely
- New title: *"One last step — add Profilissimo to your other profiles"*
- Inline pill below the title: `✓ Helper app connected` (this is the demoted celebration)
- Multi-profile card (same content as today's bottom section) becomes the page's main concern:
  - Explanation of why we can't auto-install
  - Profile list with current profile dimmed and tagged "✓ this profile"
  - Full-width primary button: *"Open Web Store in N other profile(s)"*
  - Per-row status updates as the cascade runs
  - Summary status line below the button after the cascade finishes
- Below the card: a small text-link tertiary action *"Get Started →"* that closes the tab. Always present, always closes — no state machine.

### Options page — replace the static tip with a real section

The bottom of `options.html` currently has an `info-section` with a static tip about per-profile installation. Replace it with an interactive section labeled **"Other profiles"** containing:

- Brief explanation
- Profile list (compact variant, current dimmed)
- Primary button: *"Open Web Store in N other profile(s)"*
- Status line below

Visibility: hidden entirely when `profiles.length <= 1` or when the helper app is not connected (since `list_profiles` and `open_url` both require it).

### Code organization — shared util

Extract the duplicated logic into `extension/src/utils/multi-profile-install.ts`:

```ts
export interface InstallableProfilesResult {
  all: ProfileInfo[];
  installable: ProfileInfo[];   // excludes current profile by email match
  currentEmail: string | null;
}

export async function fetchInstallableProfiles(): Promise<InstallableProfilesResult>;

export function renderInstallList(
  container: HTMLUListElement,
  result: InstallableProfilesResult,
): RowEntry[];

export type RowEntry = { profile: ProfileInfo; statusEl: HTMLSpanElement };

export type RowState = "idle" | "opening" | "opened" | "failed";
export function setRowStatus(entry: RowEntry, label: string, variant: RowState): void;

export interface CascadeResult { succeeded: number; failed: number; }
export async function openInAllProfiles(
  rows: RowEntry[],
  opts?: { intervalMs?: number },
): Promise<CascadeResult>;
```

Both `onboarding.ts` and `options.ts` import from this util. The CSS for list rows duplicates between `onboarding.css` and `options.css` (each page has its own bundle; sharing CSS would require a Vite plumbing change not worth the savings).

## Behavior matrix

| State | Onboarding | Options page |
|---|---|---|
| NMH not connected | Stay on setup steps; multi-profile section never reached | Hide "Other profiles" section entirely |
| NMH connected, 0 or 1 profiles | "You're all set!" celebration; no multi-profile section | Hide "Other profiles" section entirely |
| NMH connected, ≥1 other profile | Step 4 view: prominent CTA, tertiary "Get Started →" link below | Show "Other profiles" section with CTA |
| User clicks "Open in all" | Cascade runs; rows update in place; status summary appears below button; button changes to "Open again" / "Try again" | Identical |
| Per-row failure | Row shows red error message; summary line counts succeeded vs failed | Identical |
| All failures | Status line is red: "Could not open the Web Store. Check that the helper app is still connected." | Identical |

## Files touched

| File | Change |
|---|---|
| `extension/src/utils/multi-profile-install.ts` | NEW — shared logic |
| `extension/src/onboarding/onboarding.html` | Branch A/B markup; smaller hero |
| `extension/src/onboarding/onboarding.css` | Trim hero sizing; add `.connected-pill` style; keep list/row styles |
| `extension/src/onboarding/onboarding.ts` | Use shared util; branch A/B at verification success |
| `extension/src/options/options.html` | Replace bottom `info-section` with interactive section |
| `extension/src/options/options.css` | Add list/row styles (mirror onboarding) |
| `extension/src/options/options.ts` | Wire up new section using shared util |
| `CHANGELOG.md` | Update `[Unreleased]` entry to reflect both onboarding and options |

## Risks / open questions

- **Accidentally re-opening already-installed profiles.** The button is idempotent — clicking it on a profile that already has Profilissimo just reopens the CWS listing showing "Remove from Chrome". Slightly noisy but not harmful. Acceptable for v1; cross-profile detection (issue #1's deferred enhancement) would solve this.
- **Branding consistency.** Smaller hero on Branch B vs full hero on Branch A means two distinct layouts. The user should never see both back-to-back, but if they reload onboarding mid-flow they'd see the layout shift. Not a real concern in practice.
- **Options page section visibility flicker.** The section starts hidden; after `list_profiles` returns we either reveal or keep it hidden. Brief perceived flicker on slow NMH responses. Acceptable.

## Out of scope

- Sync-detection of which profiles already have the extension installed (deferred per issue #1).
- Permission changes (none needed).
- NMH binary changes (none needed).
- Right-click "Always open this site in [profile]" context menu entry (separate issue #3).
