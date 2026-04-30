# Open profile in target Chrome — non-http(s) sources

**Date:** 2026-04-30
**Status:** Approved (verbal)
**Issue:** #2 — Allow opening a profile without a URL for non-http pages

## Problem

Today, triggering Profilissimo from any non-`http(s)` URL fails. The extension's `isTransferableUrl` check and the NMH's scheme allowlist both reject `chrome://`, `chrome-extension://`, `about:*`, `file://`, etc.

Two real user scenarios this blocks:

1. **Profile-relative chrome:// pages.** A user on `chrome://downloads` in Personal who wants to see Work's downloads has no path forward — Profilissimo silently does nothing or shows a scheme error.
2. **No URL at all.** A user on `about:blank` or a tab still loading wants to "switch this context to another profile" — same dead end.

## Goals

1. When the user triggers Profilissimo from a profile-aware Chrome internal page (`chrome://downloads`, `chrome://settings`, etc.), open the **same URL in the target profile** so the user sees that profile's view.
2. When the source has no usable URL (or a URL that's unsafe to transfer), open a fresh window in the target profile.
3. Preserve the published 1.0.0 NMH's contract: existing users on old NMH continue to work; the new behavior gates on NMH 1.1.0+.
4. No new manifest permissions; no CWS re-review.

## Non-goals

- Per-tab dynamic context-menu labels ("Open this page in" → "Open Work in new window") — defer; the static label is mildly misleading on chrome:// pages but the action is still correct.
- Cross-profile "already installed" detection (issue #1's deferred limitation) — separate feature, not bundled here.
- Bookmarklet (`javascript:`) execution in the target profile — explicitly blocked for safety.

## Design

### Wire protocol changes (additive)

**1. New action `open_profile`**

```ts
interface OpenProfileRequest {
  action: "open_profile";
  targetProfile: string;
}
```

NMH validates `targetProfile` against the existing `PROFILE_DIR_PATTERN`. NMH spawns Chrome with **only** `--profile-directory=<X>`, no URL. Chrome opens a fresh window in that profile (or focuses the existing one and opens its NTP).

**2. Relaxed `open_url` validation**

The published 1.0.0 NMH only accepts `http:` and `https:` schemes. The 1.1.0 NMH replaces this with a much narrower blocklist:

```ts
// Reject:
//   - URLs starting with `-`         (argv flag injection)
//   - URLs containing \0, \n, \r     (argv tampering)
//   - URLs that fail to parse        (malformed)
//   - URLs with scheme `javascript:` (executable in current-page context)
// Accept everything else.
```

This admits `chrome://`, `chrome-extension://`, `about:`, `file://`, `devtools://`, `data:`, `view-source:` — every navigable scheme Chrome supports. The argv defense (`--` separator + `-` prefix rejection) remains the actual security boundary; the scheme allowlist was over-broad caution.

**3. NMH `NMH_VERSION` bumped to "1.1.0"**

The constant in `native-host/src/schema.ts`. The `health_check` response has *already* surfaced `version` since 1.0.0 — no plumbing to add. The extension uses this version to feature-gate the new flow.

### Extension behavior

**Service-worker init:**

On every service-worker start (boot, wake-from-idle), call `health_check`, read `version`, compare against `REQUIRED_NMH_VERSION = "1.1.0"`. Cache `nmhSupportsExtendedTransfer = (version >= "1.1.0")` in module state.

**Trigger paths (popup, context menu, keyboard shortcut) all funnel through `handleTransfer(url, targetProfile, sourceTabId)`:**

```
if URL exists and is transferable (per relaxed isTransferableUrl):
    if nmhSupportsExtendedTransfer OR scheme is http(s):
        send open_url
        on success: setLastUsedProfile, optionally auto-close source tab
    else:
        return existing "URL must use http: or https:" error
        (old NMH; user sees current behavior; settings page nudges them to update)

else if no URL or javascript: URL:
    if nmhSupportsExtendedTransfer:
        send open_profile
        on success: setLastUsedProfile (do NOT auto-close — no transfer happened)
    else:
        return same "URL must use http: or https:" error
```

**Auto-close behavior:**

- URL transferred (any scheme) → respect existing `closeSourceTab` config setting.
- `open_profile` (no URL) → suppress auto-close. The source tab might be intentional context (e.g., the user was reading `chrome://settings`); closing it would be hostile.

### Settings page: NMH staleness prompt

Today the options page shows three states for the helper app: connected (with copy-uninstall), or disconnected (with copy-install). Add a third middle state:

- **Connected but outdated** (NMH version < `REQUIRED_NMH_VERSION`): show "Update available" badge, the existing install/update copy-command (the install command works for upgrades — it overwrites the binary), and a brief explanation that some features need the new helper.
- Otherwise unchanged.

### Backward compatibility matrix

| Extension version | NMH version | chrome:// trigger result |
|---|---|---|
| 1.0.x (published) | 1.0.0 (published) | Existing: nothing happens / scheme error |
| 1.0.x (published) | 1.1.0 (this PR) | Same as above — old extension never sends new actions or relaxed URLs |
| 1.1.x (this PR) | 1.0.0 (published) | Same as today + settings page surfaces "Update available" |
| 1.1.x (this PR) | 1.1.0 (this PR) | New behavior: chrome:// transfers profile-aware; no-URL opens blank profile |

Every cell is either today's behavior or strictly better. **Zero regression.**

### Files

| File | Change |
|---|---|
| `native-host/src/schema.ts` | Replace `ALLOWED_URL_SCHEMES` allowlist with `BLOCKED_SCHEMES` blocklist; add `OpenProfileRequest`; tighten string sanitization (`\0`, `\n`, `\r`); bump `NMH_VERSION` to `"1.1.0"` |
| `native-host/src/main.ts` | Handle `open_profile` action |
| `native-host/src/launcher.ts` | `launchInProfile(url: string \| undefined, profileDirectory: string)` — omit URL from argv when undefined |
| `extension/src/types/messages.ts` | Add `OpenProfileRequest` to `NMHRequest` union |
| `extension/src/utils/url.ts` | Relax `isTransferableUrl` to mirror NMH's blocklist (defense in depth) |
| `extension/src/utils/constants.ts` | Add `REQUIRED_NMH_VERSION = "1.1.0"` |
| `extension/src/utils/version.ts` | NEW — `compareVersions(a, b): number` semver helper |
| `extension/src/utils/native-messaging.ts` | Add `openProfile(targetProfile)` |
| `extension/src/background/service-worker.ts` | Cache `nmhSupportsExtendedTransfer` after `healthCheck`; route in `handleTransfer`; suppress auto-close on `open_profile` |
| `extension/src/options/options.ts` | Render outdated-NMH state with update prompt |
| `CHANGELOG.md` | `[Unreleased]` entry |
| `CLAUDE.md` | Append `open_profile` to the documented action list |
| Spec | This document |

### YAGNI rejections

- **Per-tab context menu rebuilds** to relabel "Open this page in" on chrome:// pages. Heavy for marginal copy improvement.
- **A standalone "Open new window in profile" UI** (button somewhere). Existing trigger paths already cover this need.
- **Live "latest NMH version" check** (e.g., GitHub releases API). Extension hardcodes the version it requires; that's the correct relationship.
- **Special handling for `view-source:`, `data:`, etc.** to extract embedded URLs. Pass the full URL through; Chrome handles it.

## Test plan (manual; no test framework)

After building and installing the new NMH binary + reloading the unpacked extension:

- [ ] `chrome://downloads` in Personal → popup → Work → Work's downloads page opens
- [ ] `chrome://settings` → keyboard shortcut to default profile → that profile's settings opens
- [ ] `chrome://bookmarks` → context menu → that profile's bookmarks opens
- [ ] `chrome://history` → popup → that profile's history opens
- [ ] `https://example.com` → all three paths → URL transfers (regression)
- [ ] `file:///path/to/local.html` → popup → file loads in target profile
- [ ] `about:blank` → popup → blank window in target profile
- [ ] Tab on chrome:// page with `closeSourceTab` enabled → URL transfers AND source tab closes (URL transfer ⇒ auto-close still applies)
- [ ] Tab with no URL or `javascript:...` URL → popup → blank window in target profile, source tab is **NOT** closed even with `closeSourceTab` enabled
- [ ] Roll back NMH binary to 1.0.0 (revert `~/.profilissimo/bin/profilissimo-nmh`): chrome:// triggers fail with existing behavior; options page shows "Update available"

## Risks

- **Chrome behavior with `chrome --profile-directory=X` (no URL)** is not formally documented. Empirically opens a fresh window or focuses an existing one. Both are acceptable for this feature.
- **`file://` URLs across profiles**: both profiles run as the same OS user, so file system access is identical. No new attack surface.
- **`data:` URLs as phishing vector**: requires user to navigate to data: themselves and then click transfer; same risk as today's plain navigation. Not a new exposure.

## Implementation note: redirect bridge for non-http URLs

After empirical testing, Chrome silently drops `chrome://` (and likely `data:`, `file:`, `about:`) URLs when forwarded to an already-running Chrome instance via CLI. The new tab opens in the target profile, but lands on NTP rather than the requested URL. This is a Chromium security mitigation: a malicious app shouldn't be able to launch Chrome with `chrome://settings/passwords` and trick the user.

`chrome-extension://` URLs ARE accepted via CLI when the extension is installed in the target profile. So the actual implementation routes non-`http(s)` transfers through a tiny in-extension redirect page:

1. Source profile builds `chrome-extension://<extId>/redirect.html?to=<encoded original URL>`
2. NMH receives this `chrome-extension://` URL via `open_url`, validates it (passes the relaxed scheme check), and launches Chrome with it
3. Target profile's Chrome opens the new tab; the extension's `redirect.html` loads and runs `redirect.js`
4. `redirect.js` reads `?to=` and calls `chrome.tabs.update(currentTabId, { url: target })` — which IS allowed to navigate to `chrome://` URLs from an extension context with the `tabs` permission
5. The tab navigates to the real target URL

http(s) URLs skip the bridge and go direct (faster, less indirection).

**Files added:** `extension/public/redirect.html`, `extension/public/redirect.js`. Both are static assets (Vite copies `public/` to `dist/` unchanged). The HTML loads the JS via `<script src="redirect.js">` — CSP `script-src 'self'` permits this.

**Limitation surfaced by this approach:** if the target profile doesn't have Profilissimo installed, the `chrome-extension://...` URL fails to load (Chrome shows "page not found"). User sees the failure, but the source-profile transfer button still appears to "work" (no error returned). Acceptable given the multi-profile install onboarding (issue #1) directly addresses this — install in all your profiles up front.
