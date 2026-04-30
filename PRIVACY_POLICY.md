# Privacy Policy

**Last updated:** April 30, 2026

Profilissimo is a Chrome extension that lets you open tabs and links in different Chrome profiles. This policy explains what data the extension accesses, stores, and does not collect.

## What data is accessed

- **Current profile email** — Profilissimo reads the email address of the Google account signed into your current Chrome profile using the Chrome Identity API. This is used solely to identify your current profile in the UI (so it can be shown as "current" and not clickable). The email is never stored, logged, or transmitted anywhere.

- **Chrome profile list** — Profilissimo reads Chrome's local profile metadata (profile names, email addresses, and directories) through a companion helper app running on your computer. This data is used to populate the profile list in the popup and context menus.

- **Current tab URL** — When you transfer a tab, Profilissimo reads the URL of the active tab to open it in the target profile. The URL is passed to the local helper app and is never sent to any external server.

- **Top-frame navigation URLs (URL pinning, off by default)** — If you enable the optional "Auto-redirect pinned URLs" feature in Settings, Profilissimo observes the hostname of top-frame navigations to check whether it matches one of your pinned rules. Matching is performed locally in the extension's service worker against your locally-stored rules; URLs are never logged or transmitted. The feature is off by default and can be disabled at any time. Pinned-rule matching does not run when the feature is off.

## What data is stored

- **User preferences** — Your settings (default profile, close-source-tab toggle, URL pinning toggle, and pinned-rule list) are stored in a local config file (`~/.profilissimo/config.json`) on your computer. This file is shared across all Chrome profiles and is never transmitted anywhere.

- **Cached profile list** — The list of Chrome profiles is cached in `chrome.storage.local` (device-only, not synced) so the popup can load quickly.

## What data is NOT collected

- No analytics or telemetry
- No personal information transmitted to external servers
- No cookies read or written
- No browsing history accessed
- No third-party services or APIs called
- No data shared with any third party

All functionality runs entirely on your local machine. The extension communicates only with a locally installed helper app via Chrome's Native Messaging protocol.

## Permissions used

| Permission | Why |
|-----------|-----|
| `contextMenus` | Right-click menu items for transferring tabs/links |
| `identity` + `identity.email` | Detect current Chrome profile to show it as non-clickable |
| `nativeMessaging` | Communicate with the local helper app |
| `storage` | Save your preferences |
| `tabs` | Read the current tab's URL for transfer |
| `webNavigation` | Detect top-frame navigations to match against pinned-URL rules (only when URL pinning is enabled in Settings) |
| `notifications` | Show a system notification when a pinned redirect fails (e.g. target profile was deleted) so the rule misfire isn't silent |

## Contact

If you have questions about this privacy policy, open an issue at [github.com/lectops/profilissimo](https://github.com/lectops/profilissimo/issues).
