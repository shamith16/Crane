#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -ne 2 ]; then
  echo "Usage: $0 <path-to-crane-native-host-binary> <chrome-extension-id>"
  echo ""
  echo "Example:"
  echo "  $0 /usr/local/bin/crane-native-host abcdefghijklmnopqrstuvwxyzabcdef"
  exit 1
fi

BINARY_PATH="$1"
EXTENSION_ID="$2"

# Resolve binary path to absolute
BINARY_PATH="$(cd "$(dirname "$BINARY_PATH")" && pwd)/$(basename "$BINARY_PATH")"

# Verify binary exists
if [ ! -f "$BINARY_PATH" ]; then
  echo "Error: Binary not found at $BINARY_PATH"
  exit 1
fi

# Detect platform and set install directory + template
PLATFORM="$(uname -s)"
case "$PLATFORM" in
  Darwin)
    INSTALL_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    TEMPLATE="$SCRIPT_DIR/com.crane.dl.json.macos"
    ;;
  Linux)
    INSTALL_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    TEMPLATE="$SCRIPT_DIR/com.crane.dl.json.linux"
    ;;
  *)
    echo "Error: Unsupported platform '$PLATFORM'. This script supports macOS (Darwin) and Linux."
    exit 1
    ;;
esac

# Create install directory if needed
mkdir -p "$INSTALL_DIR"

# Read template, substitute placeholders, and write manifest
sed -e "s|CRANE_NATIVE_HOST_PATH|$BINARY_PATH|g" \
    -e "s|EXTENSION_ID|$EXTENSION_ID|g" \
    "$TEMPLATE" > "$INSTALL_DIR/com.crane.dl.json"

echo "Native messaging host manifest installed successfully."
echo "  Manifest: $INSTALL_DIR/com.crane.dl.json"
echo "  Binary:   $BINARY_PATH"
echo "  Extension ID: $EXTENSION_ID"
