#!/usr/bin/env bash
# Build the Ateliera vault core as an XCFramework + Swift bindings for the app.
# Products (target/, generated/, headers/, VaultCore.xcframework, and the copied
# Swift binding) are gitignored — run this after a fresh clone before building the
# Xcode app (alongside `xcodegen generate`). Uses the repo's hermetic toolchain.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
export CARGO_HOME="$root/.toolchains/cargo" RUSTUP_HOME="$root/.toolchains/rustup"
export PATH="$CARGO_HOME/bin:/opt/homebrew/bin:$PATH"
cd "$here"

# 1. Static lib for the iOS simulator. (Add aarch64-apple-ios + macOS arches into a
#    multi-slice XCFramework as later phases target device + Mac.)
cargo build --release --target aarch64-apple-ios-sim --lib

# 2. Swift bindings, generated from a host build of the same library.
cargo build --release --lib
cargo run --quiet --bin uniffi-bindgen generate \
  --library target/release/libateliera_vault_core.dylib \
  --language swift --out-dir generated

# 3. Headers + XCFramework.
rm -rf headers VaultCore.xcframework
mkdir -p headers
cp generated/ateliera_vault_coreFFI.h headers/
cp generated/ateliera_vault_coreFFI.modulemap headers/module.modulemap
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios-sim/release/libateliera_vault_core.a -headers headers \
  -output VaultCore.xcframework

# 4. Copy the Swift binding into the app source tree.
mkdir -p "$here/../Ateliera/Generated"
cp generated/ateliera_vault_core.swift "$here/../Ateliera/Generated/AtelieraVaultCore.swift"

echo "VaultCore.xcframework + Swift bindings built."
