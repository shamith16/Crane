#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "Error: Version must be semver (e.g., 0.2.0 or 1.0.0-beta.1)"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Platform-aware sed -i
sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

echo "Bumping version to $VERSION"

# 1. package.json
sedi "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$REPO_ROOT/package.json"
echo "  Updated package.json"

# 2. src-tauri/tauri.conf.json
sedi "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$REPO_ROOT/src-tauri/tauri.conf.json"
echo "  Updated src-tauri/tauri.conf.json"

# 3. src-tauri/Cargo.toml (only the package version, not dependency versions)
sedi "/^\[package\]/,/^\[/ s/^version = \"[^\"]*\"/version = \"$VERSION\"/" "$REPO_ROOT/src-tauri/Cargo.toml"
echo "  Updated src-tauri/Cargo.toml"

# 4. crates/crane-core/Cargo.toml
sedi "/^\[package\]/,/^\[/ s/^version = \"[^\"]*\"/version = \"$VERSION\"/" "$REPO_ROOT/crates/crane-core/Cargo.toml"
echo "  Updated crates/crane-core/Cargo.toml"

echo ""
echo "Version bumped to $VERSION in all 4 files."
echo "Run 'git diff' to review changes, then commit."
