// No JS-facing commands: the main crate's vault commands call this plugin's
// Rust methods (which bridge to Swift via run_mobile_plugin), so there is no ACL
// surface to generate. The build step still links the ios/ Swift package.
fn main() {
    tauri_plugin::Builder::new(&[]).build();
}
