#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

mkdir -p bin

echo "Building NMH binaries..."

~/.bun/bin/bun build --compile --target=bun-darwin-arm64 src/main.ts --outfile bin/profilissimo-nmh-darwin-arm64
echo "  ✓ darwin-arm64"

~/.bun/bin/bun build --compile --target=bun-darwin-x64 src/main.ts --outfile bin/profilissimo-nmh-darwin-x64
echo "  ✓ darwin-x64"

~/.bun/bin/bun build --compile --target=bun-linux-x64 src/main.ts --outfile bin/profilissimo-nmh-linux-x64
echo "  ✓ linux-x64"

~/.bun/bin/bun build --compile --target=bun-windows-x64 src/main.ts --outfile bin/profilissimo-nmh-windows-x64.exe
echo "  ✓ windows-x64"

echo ""
echo "All binaries built in native-host/bin/"
ls -lh bin/
