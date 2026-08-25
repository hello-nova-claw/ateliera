import Foundation
import SwiftRs
import Tauri
import UIKit
import UniformTypeIdentifiers
import WebKit

// The iOS half of the Ateliera vault. It does ONLY what must touch UIKit:
// present a folder picker, mint/resolve an iOS security-scoped bookmark, and hold
// the scoped access open. Once a folder path is handed back to Rust, the existing
// cap-std vault (commands/vault.rs) reads and writes it unchanged — see
// docs/superpowers/plans/2026-08-25-ateliera-ios.md §7a and ADR-011.
//
// iOS bookmark options differ from macOS: create with `.minimalBookmark` (NOT
// `.withSecurityScope`) and resolve with `[]`. Using `.withSecurityScope` on iOS
// fails — this is the single most common porting bug.

class ResolveArgs: Decodable {
  let bookmark: String
}

// Retains security-scoped access for the app session. The cap-std `Dir` fd that
// Rust opens from the returned path stays valid only while access is held, so we
// never call stopAccessing until the process ends (iOS reclaims it on exit).
final class ScopedAccess {
  static let shared = ScopedAccess()
  private var held: [URL] = []

  func hold(_ url: URL) {
    if url.startAccessingSecurityScopedResource() {
      held.append(url)
    }
  }
}

final class FolderPickerDelegate: NSObject, UIDocumentPickerDelegate {
  var onPick: ((URL?) -> Void)?

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    onPick?(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    onPick?(nil)
  }
}

class IosVaultPlugin: Plugin {
  private let pickerDelegate = FolderPickerDelegate()

  // Present the system folder picker; return { path, bookmark } or { cancelled }.
  @objc public func pickFolder(_ invoke: Invoke) throws {
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
    picker.delegate = pickerDelegate
    picker.allowsMultipleSelection = false
    picker.modalPresentationStyle = .fullScreen

    pickerDelegate.onPick = { url in
      guard let folder = url else {
        invoke.resolve(["cancelled": true])
        return
      }
      let accessing = folder.startAccessingSecurityScopedResource()
      defer { if accessing { folder.stopAccessingSecurityScopedResource() } }
      do {
        let data = try folder.bookmarkData(
          options: .minimalBookmark,  // iOS: NOT .withSecurityScope
          includingResourceValuesForKeys: nil,
          relativeTo: nil
        )
        // Re-open access for the session before handing the path to Rust.
        ScopedAccess.shared.hold(folder)
        invoke.resolve([
          "path": folder.path,
          "bookmark": data.base64EncodedString(),
        ])
      } catch {
        invoke.reject("Could not remember this folder: \(error.localizedDescription)")
      }
    }

    DispatchQueue.main.async {
      self.manager.viewController?.present(picker, animated: true, completion: nil)
    }
  }

  // Resolve a persisted bookmark on relaunch; hold access and return { path }.
  @objc public func resolveBookmark(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ResolveArgs.self)
    guard let data = Data(base64Encoded: args.bookmark) else {
      invoke.reject("Malformed vault bookmark")
      return
    }
    var isStale = false
    do {
      let folder = try URL(
        resolvingBookmarkData: data,
        options: [],  // iOS: NOT .withSecurityScope
        relativeTo: nil,
        bookmarkDataIsStale: &isStale
      )
      ScopedAccess.shared.hold(folder)
      invoke.resolve([
        "path": folder.path,
        "stale": isStale,
      ])
    } catch {
      invoke.reject("This vault folder is no longer available: \(error.localizedDescription)")
    }
  }
}

@_cdecl("init_plugin_ios_vault")
func initPlugin() -> Plugin {
  return IosVaultPlugin()
}
