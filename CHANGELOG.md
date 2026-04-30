# Changelog

All notable user-facing changes to Profilissimo are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Update this file in the same PR as the change, not at release time.

## [Unreleased]

### Added
- Onboarding now leads with a prominent "One last step — add Profilissimo to your other profiles" view after the helper app is verified, with a single button that opens the Web Store in every other Chrome profile so the user can add the extension to each one without context-switching.
- Settings page has a new "Other profiles" section providing the same one-click install flow for users who skipped it during onboarding.
- Profilissimo now works on Chrome internal pages: triggering a transfer from `chrome://downloads`, `chrome://settings`, `chrome://bookmarks`, etc. opens the same page in the target profile (so you see *that* profile's downloads/settings/bookmarks).
- Triggering Profilissimo from a tab with no usable URL (e.g. `about:blank`, a still-loading tab, or a `javascript:` URL) now opens a fresh window in the target profile instead of failing silently.
- Settings page surfaces a "Connected — update available" status when the helper app is older than this extension expects, with a one-click copy of the update command.

### Changed
- Onboarding hero shrinks (smaller logo, no celebration badge) when there are still profiles to install in, so the remaining step reads as the primary task instead of a footnote. The "You're all set!" celebration is preserved for users with only one Chrome profile.
- Helper app version bumped to 1.1.0. **Existing users keep working unchanged**, but the new internal-page features above require the updated helper. If you want them, copy the update command from Settings (or run the install command again) and restart Chrome.

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
