// swift-tools-version:5.9
import PackageDescription

// The `Tauri` package path is materialised by the Tauri CLI during `tauri ios
// build`/`dev` (it symlinks the Swift API under .tauri/). This mirrors the
// official Tauri plugins' ios/Package.swift layout.
let package = Package(
  name: "tauri-plugin-ios-vault",
  platforms: [
    .iOS(.v17)
  ],
  products: [
    .library(
      name: "tauri-plugin-ios-vault",
      type: .static,
      targets: ["IosVaultPlugin"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "IosVaultPlugin",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources/IosVaultPlugin")
  ]
)
