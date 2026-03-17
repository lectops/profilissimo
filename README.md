<p align="center">
  <img src="extension/public/icons/p-logo.png" alt="Profilissimo" width="96" height="96">
</p>

<h1 align="center">Profilissimo</h1>

<p align="center">
  Open the current tab or any link in a different Chrome profile — with one click.
</p>

<p align="center">
  <img src="extension/public/icons/profilissimo-logo.png" alt="profilissimo" height="28">
</p>

---

## What it does

Profilissimo adds a popup menu, right-click context menus, and a keyboard shortcut to transfer any tab or link to another Chrome profile. No more copy-pasting URLs between browser windows.

**Features:**
- Click the toolbar icon to see all your Chrome profiles and transfer the current tab
- Right-click any page or link to open it in a specific profile
- Keyboard shortcut (`Alt+Shift+P`) for instant transfer to your default profile
- Optionally auto-close the source tab after transfer

> **Platform support:** macOS only for now. Linux and Windows support is planned.

## How it works

Chrome extensions can't launch other profiles directly, so Profilissimo uses a **Native Messaging Host (NMH)** — a small helper binary that runs outside the browser. The extension sends a message to the NMH, which spawns Chrome with the target profile and URL.

```
Extension  ---(native messaging)--->  NMH binary  ---(spawn)--->  Chrome --profile-directory=...
```

## Installation

### Step 1: Install the extension

> The extension is not yet on the Chrome Web Store. For now, load it as an unpacked extension.

1. Clone this repo and build the extension (see [Building from source](#building-from-source))
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the `extension/dist` folder
5. Note your extension ID (shown under the extension name, e.g. `abcdefghijklmnopqrstuvwxyz`)

### Step 2: Install the Native Messaging Host

The NMH is a standalone binary that Chrome launches when the extension needs it. You have two options:

#### Option A: Download the pre-built binary

Download the binary for your Mac from the [latest release](https://github.com/lectops/profilissimo/releases/latest):

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `profilissimo-nmh-darwin-arm64` |
| macOS (Intel) | `profilissimo-nmh-darwin-x64` |

Then register it with Chrome (see Step 3 below).

#### Option B: Build from source

See [Building from source](#building-from-source) below.

### Step 3: Register the NMH with Chrome

Chrome needs a JSON manifest file that tells it where the NMH binary is and which extensions are allowed to use it.

```bash
mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

cat > "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.profilissimo.nmh.json" << EOF
{
  "name": "com.profilissimo.nmh",
  "description": "Profilissimo Native Messaging Host",
  "path": "/absolute/path/to/profilissimo-nmh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
EOF
```

> **Important:** Replace `/absolute/path/to/profilissimo-nmh` with the actual path to the binary, and `YOUR_EXTENSION_ID` with the extension ID from Step 1.

### Step 4: Restart Chrome

Quit Chrome completely (`Cmd+Q`) and reopen it. Chrome only detects new native messaging hosts on startup.

### Step 5: Verify

Click the Profilissimo icon in the toolbar. If you see your Chrome profiles listed, you're all set.

## Usage

### Popup
Click the Profilissimo icon in the toolbar. Your Chrome profiles appear in a list. Click one to open the current page in that profile.

### Context menu
Right-click any page or link. Under **"Open this page in..."** or **"Open link in..."**, pick the target profile.

### Keyboard shortcut
Press `Alt+Shift+P` to instantly transfer the current tab to your default profile. Set the default in **Settings** (gear icon in the popup). You can customize the shortcut at `chrome://extensions/shortcuts`.

### Settings
Click the gear icon in the popup or go to the extension's options page:
- **Default profile** — used for the keyboard shortcut
- **Close source tab** — automatically close the tab after transferring
- **Show notifications** — display a notification on transfer

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) (for compiling the NMH binary)
- npm (comes with Node.js)

### Build everything

```bash
git clone https://github.com/lectops/profilissimo.git
cd profilissimo
npm install
npm run build
```

This compiles both the extension (to `extension/dist/`) and the NMH TypeScript (to `native-host/dist/`).

### Build the extension only

```bash
npm run build:extension
```

Output is in `extension/dist/`. Load this folder as an unpacked extension in Chrome.

### Build the NMH binary

To compile a standalone binary for your current platform:

```bash
npm run build:binary -w native-host
```

Output is `native-host/bin/profilissimo-nmh`.

### Development

```bash
npm run dev    # Vite dev server with hot reload for the extension
```

Load `extension/dist/` as an unpacked extension. Vite will rebuild on file changes.

For the NMH during development, you can run it directly with Node instead of compiling a binary:

```bash
node native-host/dist/main.js
```

## Project structure

```
profilissimo/
├── extension/                 # Chrome extension (Manifest V3)
│   ├── src/
│   │   ├── background/        # Service worker (context menus, message routing)
│   │   ├── popup/             # Toolbar popup UI
│   │   ├── options/           # Settings page
│   │   ├── onboarding/        # First-run setup guide
│   │   ├── types/             # Shared TypeScript interfaces
│   │   └── utils/             # Helpers (NMH communication, storage, formatting)
│   ├── public/                # Static assets (manifest.json, icons)
│   └── dist/                  # Build output (load this in Chrome)
├── native-host/               # Native Messaging Host
│   ├── src/
│   │   ├── main.ts            # Stdin/stdout message loop
│   │   ├── schema.ts          # Request validation
│   │   ├── profiles.ts        # Chrome profile discovery
│   │   └── launcher.ts        # Chrome process spawning
│   └── bin/                   # Compiled binaries (gitignored)
├── installer/                 # Install scripts
│   └── install.sh             # macOS
└── .github/workflows/         # CI/CD (release on tag push)
```

## Security

- The NMH only accepts `http:` and `https:` URLs — no `javascript:`, `file:`, or `data:` schemes
- Profile directory names are validated against `/^[a-zA-Z0-9 _-]+$/` to prevent argument injection
- URLs starting with `-` are rejected to prevent Chrome CLI flag injection
- The NMH manifest's `allowed_origins` restricts which extensions can communicate with it
- The extension validates all messages from the popup/options pages before processing
- NMH responses are validated at the extension boundary before use
- No data leaves your machine — everything runs locally between the extension and the NMH binary

## License

MIT
