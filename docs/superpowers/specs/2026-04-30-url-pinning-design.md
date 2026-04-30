# URL pinning — auto-redirect specific hostnames to a designated profile

**Date:** 2026-04-30
**Status:** Approved (verbal)
**Issue:** #3 — URL pinning: auto-redirect specific URLs to a designated profile
**Bundled with:** #2 (open chrome://) for a single 1.1.0 release

## Problem

Users with multiple Chrome profiles repeatedly open URLs in the wrong profile (typing `mail.google.com` in Personal when they meant Work). Today they have to recognize the mistake, open Profilissimo, transfer the tab. URL pinning lets them declare "this hostname always belongs in Work" once, and the extension does the rest.

## Goals

1. When the user navigates to a pinned hostname in the wrong profile, automatically transfer to the correct profile and close the source tab.
2. Discoverable: a right-click menu item adds a pin in one click.
3. No flash of wrong-profile content (use `webNavigation.onBeforeNavigate`, not `tabs.onUpdated`).
4. Default off; user opts in via Settings before any URL observation begins.
5. Bundle with #2's NMH push so existing users only update once.

## Non-goals

- Path-prefix or wildcard matching (defer to v2).
- Bypass affordance (Shift-click etc.) — disable rule in Settings to override.
- Cross-machine rule sync (NMH config is per-machine).
- Rule import/export.
- Pinning by content / page title.

## Design

### Pattern matching: exact full hostname

A rule's pattern is a single hostname string. A URL matches a rule iff the URL's hostname equals the pattern exactly.

| Rule | Matches | Doesn't match |
|---|---|---|
| `pjlhuillier.monday.com` | `https://pjlhuillier.monday.com/...` | `https://john.monday.com/...`, `https://monday.com/...` |
| `mail.google.com` | `https://mail.google.com/...` | `https://docs.google.com/...`, `https://google.com/...` |

Validation at rule-creation time:
- Pattern must be a valid hostname syntax (no scheme, no path, no leading/trailing dots, no whitespace, lowercase only).
- Implementation check: `new URL("https://" + pattern).hostname === pattern`.

The user can pin multiple hostnames separately if they want broader coverage.

### Trigger: webNavigation.onBeforeNavigate, top-frame only

```ts
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;     // skip iframes
  if (!urlPinningEnabled) return;         // feature flag
  // ...match, redirect
});
```

`onBeforeNavigate` fires synchronously before any network request, so there's no flash of wrong-profile content. We don't *block* the navigation (that would require `webRequest` blocking permission, which is heavy) — we let it proceed in the source tab while we open the URL in the target profile and close the source tab. The user briefly sees a loading state, then the source tab disappears.

### Loop guard: identify our own profile, skip if we're the target

The extension can't directly query its own profile directory. Workaround:

1. On service-worker init, call `chrome.identity.getProfileUserInfo()` to get the email.
2. Call `list_profiles` via NMH to map email → directory.
3. Cache `currentProfileDirectory` in module state (and `chrome.storage.local` for restart resilience).
4. Before redirecting, compare the rule's `targetProfileDirectory` against `currentProfileDirectory`. If equal → skip.
5. If `currentProfileDirectory` is unknown (no email, NMH unreachable) → skip defensively. Better to not redirect than to risk a loop.

### Storage: NMH config, not chrome.storage.sync

`chrome.storage.sync` only ferries data between profiles signed into the same Google account. Profilissimo's audience juggles multiple accounts. NMH config is per-machine, account-agnostic, and we already have the wire plumbing.

Schema additions to `~/.profilissimo/config.json`:

```ts
interface AppConfig {
  defaultProfile: string | null;
  closeSourceTab: boolean;
  urlPinningEnabled: boolean;             // NEW — default false
  pinnedRules: PinnedRule[];               // NEW — default []
}

interface PinnedRule {
  id: string;                              // uuid v4
  pattern: string;                         // exact hostname
  targetProfileDirectory: string;          // e.g. "Profile 2"
  createdAt: number;                       // unix ms, for stable sort
}
```

Wire protocol additions (additive within the in-progress 1.1.0 NMH bump):

- `set_config` accepts `urlPinningEnabled?: boolean` and `pinnedRules?: PinnedRule[]`
- `get_config` returns these fields
- NMH validates `pinnedRules` schema strictly (each rule must have all fields; pattern must be a valid hostname; targetProfileDirectory must match `PROFILE_DIR_PATTERN`).

### Discovery: right-click context menu

Service-worker context-menu builder gains a third top-level entry alongside the existing "Open this page in…" and "Open link in…":

> **Always open this site in…**
>   ↳ Personal
>   ↳ Work

Click → adds a rule with the current page's hostname as the pattern, the chosen profile as the target. No confirmation dialog — undo by removing in Settings.

The submenu is hidden when `urlPinningEnabled` is false. (Avoids the "discoverable but disabled" anti-pattern where the user clicks and nothing happens.)

### Settings page: Pinned URLs section

New section between **Behavior** and **Keyboard Shortcut**:

- **Toggle**: "Auto-redirect pinned URLs" (master enable/disable). When OFF, the rules table is shown but inert.
- **First-time toggle disclosure**: a small inline message appears the first time the user enables it: *"Profilissimo will check the URLs you visit against your rules. Nothing leaves your machine."* Dismissible; never reappears.
- **Rules table**: pattern + target profile + remove button per row. Sorted by `createdAt` ascending.
- **Add rule form**: text input + profile dropdown + "Add" button. Live-validates pattern.

### Auto-close on redirect

When the redirect fires, the source tab is closed unconditionally — the tab opened to the wrong URL has no other state worth preserving. (Different from the existing `closeSourceTab` setting, which gates manual transfers.)

### Feature flag default: OFF

The `urlPinningEnabled` field defaults to `false`. The user must explicitly enable it in Settings before any URL observation begins. Rationale:

- The `webNavigation` permission is psychologically heavier than the rest of the extension. Default-off respects users who don't need this feature.
- A misfire would be very noticeable (wrong profile opens unexpectedly). Default-off keeps the blast radius small while we ramp.
- Users who DO want the feature opt in once and forget about it.

### Permissions and privacy

- `manifest.json` adds `webNavigation` to `permissions`.
- CWS re-review on submission.
- **Existing users see a permission-grant prompt on auto-update**: "Profilissimo wants to: View your browsing history." This is a real friction point but unavoidable for the feature.
- `PRIVACY_POLICY.md` updated to disclose:
  - The extension observes top-frame navigations to match against pinned rules.
  - All processing is local; no network calls; no logging.
  - The feature is off by default and users can disable it at any time.

### Files

| File | Change |
|---|---|
| `extension/public/manifest.json` | add `webNavigation` permission |
| `PRIVACY_POLICY.md` | disclose URL observation under feature flag |
| `native-host/src/schema.ts` | extend `SetConfigRequest` with new fields; add `PinnedRule`; validate |
| `native-host/src/config.ts` | extend `AppConfig`; persist new fields |
| `native-host/src/main.ts` | pass new fields through `set_config` handler |
| `extension/src/types/messages.ts` | mirror `PinnedRule`; extend config types |
| `extension/src/utils/pin-matcher.ts` | NEW — hostname matcher + rule lookup |
| `extension/src/utils/profile-identity.ts` | NEW — current profile directory cache |
| `extension/src/utils/native-messaging.ts` | extend `getConfig`/`setConfig` types |
| `extension/src/utils/uuid.ts` | NEW — small uuid v4 (no deps) |
| `extension/src/background/service-worker.ts` | webNavigation listener; rule loading; loop guard; "Always open in…" submenu |
| `extension/src/options/options.html` | Pinned URLs section markup |
| `extension/src/options/options.css` | rules-table styling |
| `extension/src/options/options.ts` | toggle, rules table, add form, first-time disclosure |
| `CHANGELOG.md` | `[Unreleased]` entry |
| Spec | this document |

## Test plan (manual)

After install + reload + flipping the toggle on:

- [ ] Pin `pjlhuillier.monday.com` → Work. Open it in Personal → tab redirects to Work; source tab closes.
- [ ] Pin `monday.com` separately → does NOT redirect `pjlhuillier.monday.com` (exact-match semantics).
- [ ] In Work, open `pjlhuillier.monday.com` → no redirect (loop guard).
- [ ] Right-click any page → "Always open this site in…" → pick a profile → check rule appears in Settings.
- [ ] Settings: remove a rule → its pattern stops triggering redirects.
- [ ] Toggle URL pinning OFF → no redirects fire even with rules present; submenu disappears from context menu.
- [ ] First time toggling ON, the inline disclosure appears; toggling off + on again, it doesn't reappear.
- [ ] iframes navigating to a pinned URL: no redirect (top-frame guard).
- [ ] On 1.0.0 NMH (rolled back): rules just don't load (graceful degradation; settings shows "update helper app").

## Risks

- **`webNavigation` is the heaviest permission Profilissimo will have requested.** A noticeable fraction of users may decline the upgrade prompt. Mitigation: default-off, clear privacy disclosure, this is bundled with the chrome:// feature so the value prop is wider.
- **`onBeforeNavigate` doesn't fire for some edge cases** (history.pushState SPA navigations, prerenders). Acceptable for v1; URL pinning is most useful for the address-bar-typing case which always triggers a real navigation.
- **Profile rename**: if the user renames the target profile in Chrome's profile manager, the directory string can stay stable (`Profile 2`) even as the display name changes. Storing directory (not display name) is the right call.
- **Rule pointing to deleted profile**: NMH spawn fails, source tab stays. We could surface an error notification; for v1, accept silent failure (user notices and removes the stale rule).

## Out of scope

- Path-prefix or wildcard patterns
- Bypass affordances
- Rule import/export
- Cross-machine rule sync
- Pinning by content/title
