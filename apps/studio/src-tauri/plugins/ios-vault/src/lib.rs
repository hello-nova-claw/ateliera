//! The iOS half of the Ateliera vault.
//!
//! This plugin does only what must touch UIKit — present a folder picker and
//! mint/resolve an iOS security-scoped bookmark. It exposes no JS commands; the
//! main crate's `vault_select` / `vault_create` call [`IosVault::pick_folder`] /
//! [`IosVault::resolve_bookmark`] from Rust, take the returned folder path, and
//! hand it to the existing cap-std vault via `register_existing_path`. See
//! `docs/superpowers/plans/2026-08-25-ateliera-ios.md` §7a and ADR-011.

use serde::Deserialize;
#[cfg(target_os = "ios")]
use serde::Serialize;
use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_ios_vault);

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("the vault folder picker is only available on iOS")]
    Unsupported,
    #[error("{0}")]
    Invoke(String),
}

/// The outcome of a pick or resolve. Exactly one of `path` / `cancelled` is set.
#[derive(Debug, Clone, Deserialize)]
pub struct PickedFolder {
    /// Absolute path to the security-scoped folder, with access already held.
    pub path: Option<String>,
    /// Base64 iOS bookmark to persist for a re-pick-free relaunch (pick only).
    pub bookmark: Option<String>,
    /// The user dismissed the picker without choosing.
    #[serde(default)]
    pub cancelled: bool,
    /// The resolved bookmark was stale and should be re-minted (resolve only).
    #[serde(default)]
    pub stale: bool,
}

// Request payloads for the Swift bridge — only constructed on iOS.
#[cfg(target_os = "ios")]
#[derive(Serialize)]
struct Empty {}

#[cfg(target_os = "ios")]
#[derive(Serialize)]
struct ResolveRequest {
    bookmark: String,
}

/// Managed state exposing the picker to the main crate's vault commands.
pub struct IosVault<R: Runtime> {
    #[cfg(target_os = "ios")]
    handle: tauri::plugin::PluginHandle<R>,
    // `fn() -> R` is always Send + Sync, so the managed state satisfies `manage`
    // regardless of the runtime's own auto-traits.
    #[cfg(not(target_os = "ios"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> IosVault<R> {
    /// Present the system folder picker and return the chosen folder + bookmark.
    pub fn pick_folder(&self) -> Result<PickedFolder, Error> {
        #[cfg(target_os = "ios")]
        {
            self.handle
                .run_mobile_plugin("pickFolder", Empty {})
                .map_err(|error| Error::Invoke(error.to_string()))
        }
        #[cfg(not(target_os = "ios"))]
        {
            Err(Error::Unsupported)
        }
    }

    /// Resolve a persisted bookmark on relaunch, holding scoped access.
    pub fn resolve_bookmark(&self, bookmark: String) -> Result<PickedFolder, Error> {
        #[cfg(target_os = "ios")]
        {
            self.handle
                .run_mobile_plugin("resolveBookmark", ResolveRequest { bookmark })
                .map_err(|error| Error::Invoke(error.to_string()))
        }
        #[cfg(not(target_os = "ios"))]
        {
            let _ = bookmark;
            Err(Error::Unsupported)
        }
    }
}

/// Convenience accessor: `app.ios_vault()`.
pub trait IosVaultExt<R: Runtime> {
    fn ios_vault(&self) -> &IosVault<R>;
}

impl<R: Runtime, T: Manager<R>> IosVaultExt<R> for T {
    fn ios_vault(&self) -> &IosVault<R> {
        self.state::<IosVault<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ios-vault")
        .setup(|app, _api| {
            #[cfg(target_os = "ios")]
            let vault = IosVault {
                handle: _api.register_ios_plugin(init_plugin_ios_vault)?,
            };
            #[cfg(not(target_os = "ios"))]
            let vault = IosVault::<R> {
                _marker: std::marker::PhantomData,
            };
            app.manage(vault);
            Ok(())
        })
        .build()
}
