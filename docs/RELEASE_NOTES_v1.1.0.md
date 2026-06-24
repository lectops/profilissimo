# Profilissimo v1.1.0

A big update: a full visual refresh, automatic dark mode, and several new ways to move pages between profiles.

## ⚠️ Existing users — update the helper app

Chrome auto-updates the extension, but it **cannot** update the small helper app on your Mac. Your existing setup keeps working for the core "move this tab to another profile" action, but the **new features below require the updated helper.**

Update it (re-runs the one-line installer; safe, no admin password):

```
curl -fsSL https://raw.githubusercontent.com/lectops/profilissimo/main/installer/install.sh | bash
```

Then quit and reopen Chrome. Settings → **The helper app** shows your status and a one-click copy of this command, or download the binary directly from the assets below. After updating, Profilissimo shows "Helper connected."

## ⚠️ New permission prompt

After the extension auto-updates you may see:

> "Profilissimo has been disabled because it requires new permissions. It now wants to: View your browsing history"

This is only for the optional **URL pinning** feature and is **off by default**. Click **Enable** to keep using Profilissimo — pinning stays off until you turn it on. Browsing history is only ever read locally to match your pins; nothing leaves your Mac.

## ✨ New

- **Visual refresh** of the popup, Settings, and onboarding — clearer layout, a calmer one-step setup, and **automatic dark mode** that follows your system appearance.
- **Open a new window** in any profile, right from the popup (no tab is moved).
- **Pin a site to a profile** — that site then always opens in the right profile. Pin from the popup, the right-click menu ("Pin this site to…"), or Settings → Pinned sites. (Off by default; turn on auto-redirect in Settings.)
- **Works on Chrome internal pages** — transfer `chrome://settings`, `chrome://downloads`, etc. to another profile.
- **Backup & restore** your settings to a JSON file and import on another Mac. Pins follow your accounts by email even if Chrome assigns different profile slots.
- **Email-based targeting** — pins and your default profile remember the account, so they keep working across machines and profile renames.

## Changed

- The "always open this site in a profile" feature is now consistently called **pinning** everywhere.
- Clearer messaging when an action needs the updated helper app.

## Notes

- macOS (Apple Silicon) only.
- Full changelog: see `CHANGELOG.md` → [1.1.0].

---
*If you only use the basic "move this tab" feature, you don't have to do anything — it keeps working. Update the helper app whenever you want the new features.*
