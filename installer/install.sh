#!/bin/bash
set -euo pipefail

# --- Configuration (update these before publishing) ---
GITHUB_REPO="lectops/profilissimo"
EXTENSION_ID="EXTENSION_ID_HERE"
NMH_NAME="com.profilissimo.nmh"
INSTALL_DIR="$HOME/.profilissimo/bin"
BINARY_NAME="profilissimo-nmh"

# --- Detect OS and architecture ---
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin) ;;
  linux)  ;;
  *)
    echo "ERROR: Unsupported OS '$OS'. Use install.ps1 for Windows." >&2
    exit 1
    ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
  *)
    echo "ERROR: Unsupported architecture '$ARCH'." >&2
    exit 1
    ;;
esac

# Linux arm64 not currently built
if [[ "$OS" == "linux" && "$ARCH" == "arm64" ]]; then
  echo "ERROR: Linux arm64 is not yet supported. Use x64." >&2
  exit 1
fi

ASSET_NAME="$BINARY_NAME-$OS-$ARCH"
DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/latest/download/$ASSET_NAME"

# --- Determine NMH manifest directory ---
case "$OS" in
  darwin)
    MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  linux)
    MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    ;;
esac

# --- Download binary ---
echo "Downloading $ASSET_NAME..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"
echo "Installed binary to $INSTALL_DIR/$BINARY_NAME"

# --- Write NMH manifest ---
mkdir -p "$MANIFEST_DIR"
cat > "$MANIFEST_DIR/$NMH_NAME.json" << EOF
{
  "name": "$NMH_NAME",
  "description": "Profilissimo Native Messaging Host",
  "path": "$INSTALL_DIR/$BINARY_NAME",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
echo "Wrote NMH manifest to $MANIFEST_DIR/$NMH_NAME.json"

echo ""
echo "Installation complete!"
echo "Restart Chrome (Cmd+Q / Ctrl+Q, then reopen) for changes to take effect."
