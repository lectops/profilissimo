# Privacy Policy

**Last updated:** March 17, 2026

Profilissimo is a Chrome extension that lets you open tabs and links in different Chrome profiles. This policy explains what data the extension accesses, stores, and does not collect.

## What data is accessed

- **Current profile email** — Profilissimo reads the email address of the Google account signed into your current Chrome profile using the Chrome Identity API. This is used solely to identify your current profile in the UI (so it can be shown as "current" and not clickable). The email is never stored, logged, or transmitted anywhere.

- **Chrome profile list** — Profilissimo reads Chrome's local profile metadata (profile names, email addresses, and directories) through a companion helper app running on your computer. This data is used to populate the profile list in the popup and context menus.

- **Current tab URL** — When you transfer a tab, Profilissimo reads the URL of the active tab to open it in the target profile. The URL is passed to the local helper app and is never sent to any external server.

## What data is stored

- **User preferences** — Your settings (default profile, close-source-tab toggle, show-notifications toggle) are stored in `chrome.storage.sync`, which Chrome may sync across your devices if you have Chrome Sync enabled.

- **Last used profile** — The directory name of the last profile you transferred a tab to is stored in `chrome.storage.local` (device-only, not synced).

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

## Contact

If you have questions about this privacy policy, open an issue at [github.com/lectops/profilissimo](https://github.com/lectops/profilissimo/issues).
