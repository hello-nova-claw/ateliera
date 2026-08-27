#!/usr/bin/env bash
# Build the Ateliera vault core as an XCFramework + Swift bindings for the app.
# Products (target/, generated/, headers/, VaultCore.xcframework, and the copied
# Swift binding) are gitignored — run this after a fresh clone before building the
# Xcode app (alongside `xcodegen generate`). Uses the repo's hermetic toolchain.
#
# The XCFramework ships three slices: iOS device (arm64), iOS simulator (a fat
# arm64+x86_64 lib so it runs on Apple-Silicon and Intel Macs), and macOS (arm64).
# A universal macOS slice (add x86_64) is a follow-up once that Rust target is
# installed in the hermetic toolchain.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
export CARGO_HOME="$root/.toolchains/cargo" RUSTUP_HOME="$root/.toolchains/rustup"
export PATH="$CARGO_HOME/bin:/opt/homebrew/bin:$PATH"
cd "$here"

# 1. Static libs for every shipping platform slice.
cargo build --release --target aarch64-apple-ios --lib      # iPhone / iPad device
cargo build --release --target aarch64-apple-ios-sim --lib  # simulator (Apple Silicon)
cargo build --release --target x86_64-apple-ios --lib       # simulator (Intel Macs)
cargo build --release --target aarch64-apple-darwin --lib   # macOS (Apple Silicon)

# 2. Swift bindings, generated from a host build of the same library.
cargo build --release --lib
cargo run --quiet --bin uniffi-bindgen generate \
  --library target/release/libateliera_vault_core.dylib \
  --language swift --out-dir generated

# 3. Headers + a universal simulator slice + the multi-slice XCFramework.
rm -rf headers VaultCore.xcframework
mkdir -p headers
cp generated/ateliera_vault_coreFFI.h headers/
cp generated/ateliera_vault_coreFFI.modulemap headers/module.modulemap

# A single XCFramework slice can't hold two libraries for the same platform, so the
# two simulator arches are fused into one fat archive with lipo.
mkdir -p target/universal-ios-sim/release
lipo -create \
  target/aarch64-apple-ios-sim/release/libateliera_vault_core.a \
  target/x86_64-apple-ios/release/libateliera_vault_core.a \
  -output target/universal-ios-sim/release/libateliera_vault_core.a

xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libateliera_vault_core.a -headers headers \
  -library target/universal-ios-sim/release/libateliera_vault_core.a -headers headers \
  -library target/aarch64-apple-darwin/release/libateliera_vault_core.a -headers headers \
  -output VaultCore.xcframework

# 4. Copy the Swift binding into the app source tree.
mkdir -p "$here/../Ateliera/Generated"
cp generated/ateliera_vault_core.swift "$here/../Ateliera/Generated/AtelieraVaultCore.swift"

echo "VaultCore.xcframework (ios-arm64, ios-sim arm64+x86_64, macos-arm64) + Swift bindings built."
