# Changelog

All notable user-facing changes to Profilissimo are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Update this file in the same PR as the change, not at release time.

## [Unreleased]

### Heads-up for existing users on auto-update

After Chrome auto-updates Profilissimo to this version, you'll see a prompt:

> **"Profilissimo has been disabled because it requires new permissions."**
> **It now wants to: View your browsing history**

This is for the new optional URL pinning feature (see below) and is **off by default**. Click **Enable** to keep using Profilissimo. If you decline, every other feature still works normally — only URL pinning will be unavailable.

If you want the new chrome:// transfer or URL pinning features, you also need to update the helper app. Settings will show a yellow "Connected — update available" status with a one-click copy-update-command button (or download the binary manually from the GitHub release page).

### Added
- Onboarding now leads with a prominent "One last step — add Profilissimo to your other profiles" view after the helper app is verified, with a single button that opens the Web Store in every other Chrome profile so the user can add the extension to each one without context-switching.
- Settings page has a new "Other profiles" section providing the same one-click install flow for users who skipped it during onboarding.
- Profilissimo now works on Chrome internal pages: triggering a transfer from `chrome://downloads`, `chrome://settings`, `chrome://bookmarks`, etc. opens the same page in the target profile (so you see *that* profile's downloads/settings/bookmarks).
- Triggering Profilissimo from a tab with no usable URL (e.g. `about:blank`, a still-loading tab, or a `javascript:` URL) now opens a fresh window in the target profile instead of failing silently.
- Settings page surfaces a "Connected — update available" status when the helper app is older than this extension expects, with a one-click copy of the update command **and a "Download manually" link** to the versioned GitHub release page for users who'd rather grab the binary directly.
- URL pinning (off by default): designate that a specific hostname always opens in a chosen profile. Right-click any page → "Always open this site in…", use the toolbar popup's profile picker, or manage rules from the new "Pinned URLs" section in Settings. Matches the full hostname only (`mail.google.com` ≠ `docs.google.com`). When you navigate to a pinned site in the wrong profile, Profilissimo opens it in the right one and closes the source tab. Pinning to a different profile from the popup or the right-click menu also transfers the current tab there immediately, so you don't have to follow up with a manual transfer. Requires the `webNavigation` permission, which the extension only uses while the toggle is on.
- If a pinned redirect fails (e.g. the target profile was deleted in Chrome), Profilissimo now surfaces a system notification instead of silently leaving the source tab open. Settings also shows the rule's target as "(unavailable)" so it's easy to spot and remove.

### Changed
- Onboarding hero shrinks (smaller logo, no celebration badge) when there are still profiles to install in, so the remaining step reads as the primary task instead of a footnote. The "You're all set!" celebration is preserved for users with only one Chrome profile.
- Onboarding's success states now include a one-line callout introducing the URL pinning gesture.
- Helper app version bumped to 1.1.0. **Existing users keep working unchanged**, but the new chrome:// transfer and URL pinning features require the updated helper. The Settings page now hides the URL pinning controls (and shows a "needs update" notice) until the helper is upgraded, so the toggle no longer silently fails to persist on older helpers.
- The error shown when a transfer needs the newer helper now reads "Update the helper app to transfer this URL — open Settings to update." instead of the misleading legacy "URL must use http: or https: scheme".

### Security
- Helper app URL validation tightened: the new scheme blocklist replaces the old http(s)-only allowlist. `javascript:` URLs and any URL containing argv-injection vectors (`-` prefix, control characters) are still rejected; everything Chrome can navigate to is now allowed through.

## [1.0.0] - 2026-03-17

Initial release on the Chrome Web Store.

### Added
- Toolbar popup listing all Chrome profiles for one-click tab transfer
- Right-click context menus for opening links/pages in a specific profile
- Keyboard shortcut (`Alt+Shift+P`) for instant transfer to a default profile
- Options page for default profile, auto-close, and notification settings
- First-run onboarding guide
- macOS Apple Silicon NMH binary

[Unreleased]: https://github.com/lectops/profilissimo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lectops/profilissimo/releases/tag/v1.0.0
