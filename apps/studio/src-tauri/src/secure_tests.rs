use std::{
    fs,
    sync::mpsc,
    time::{Duration, Instant},
};

use serde_json::json;
use tauri::{Listener, Manager, test, webview::InvokeRequest};

use crate::{commands::vault::VaultRegistry, revoke_window, studio_builder};

fn request(command: &str, body: serde_json::Value) -> InvokeRequest {
    InvokeRequest {
        cmd: command.into(),
        callback: tauri::ipc::CallbackFn(0),
        error: tauri::ipc::CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: tauri::ipc::InvokeBody::Json(body),
        headers: Default::default(),
        invoke_key: test::INVOKE_KEY.to_owned(),
    }
}

fn app() -> tauri::App<test::MockRuntime> {
    studio_builder(test::mock_builder())
        .build(test::mock_context(test::noop_assets()))
        .unwrap()
}

fn invoke_mock(
    webview: &tauri::WebviewWindow<test::MockRuntime>,
    command: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, serde_json::Value> {
    test::get_ipc_response(webview, request(command, body))
        .map(|response| response.deserialize().unwrap())
}

#[test]
fn ipc_uses_an_opaque_retained_directory_capability() {
    let selected_parent = tempfile::tempdir().unwrap();
    let selected = selected_parent.path().join("selected");
    fs::create_dir(&selected).unwrap();
    fs::write(selected.join("inside.md"), "retained").unwrap();

    let app = app();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let token = app
        .state::<VaultRegistry>()
        .register_selected_path_for_test("main", &selected)
        .unwrap();
    assert!(!token.contains(selected.to_str().unwrap()));

    let moved = selected_parent.path().join("moved-after-selection");
    fs::rename(&selected, &moved).unwrap();
    fs::create_dir(&selected).unwrap();
    fs::write(selected.join("inside.md"), "replacement").unwrap();

    let response = invoke_mock(
        &webview,
        "vault_read_text",
        json!({ "vaultToken": token, "path": "inside.md" }),
    )
    .unwrap();
    assert_eq!(response["text"], "retained");

    let forged = invoke_mock(
        &webview,
        "vault_read_text",
        json!({ "vaultToken": selected, "path": "inside.md" }),
    );
    assert_eq!(forged.unwrap_err(), json!("unavailable"));
}

#[test]
fn ipc_rejects_symlink_components_and_traversal() {
    use std::os::unix::fs::symlink;

    let selected = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.md"), "secret").unwrap();
    symlink(outside.path(), selected.path().join("escape")).unwrap();

    let app = app();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let token = app
        .state::<VaultRegistry>()
        .register_selected_path_for_test("main", selected.path())
        .unwrap();

    for path in ["../secret.md", "escape/secret.md"] {
        let response = invoke_mock(
            &webview,
            "vault_read_text",
            json!({ "vaultToken": token, "path": path }),
        );
        assert_eq!(response.unwrap_err(), json!("path_escape"));
    }
}

#[test]
fn exact_cas_preserves_an_external_write_that_wins_before_commit() {
    let selected = tempfile::tempdir().unwrap();
    fs::write(selected.path().join("note.md"), "original").unwrap();

    let registry = VaultRegistry::default();
    let token = registry
        .register_selected_path_for_test("main", selected.path())
        .unwrap();
    let vault = registry.vault_for_test("main", &token).unwrap();
    let expected = vault.read_text("note.md").unwrap().hash;

    let result = vault.write_text_atomic_with_before_commit_for_test(
        "note.md",
        "ours",
        Some(&expected),
        || fs::write(selected.path().join("note.md"), "external").unwrap(),
    );
    assert!(matches!(
        result,
        Err(crate::commands::vault::VaultError::Conflict)
    ));
    assert_eq!(
        fs::read_to_string(selected.path().join("note.md")).unwrap(),
        "external"
    );
}

#[test]
fn no_clobber_move_preserves_an_external_destination() {
    let selected = tempfile::tempdir().unwrap();
    fs::write(selected.path().join("from.md"), "source").unwrap();
    fs::write(selected.path().join("to.md"), "external").unwrap();
    let registry = VaultRegistry::default();
    let token = registry
        .register_selected_path_for_test("main", selected.path())
        .unwrap();
    let vault = registry.vault_for_test("main", &token).unwrap();

    assert!(matches!(
        vault.move_path("from.md", "to.md"),
        Err(crate::commands::vault::VaultError::Conflict)
    ));
    assert_eq!(
        fs::read_to_string(selected.path().join("from.md")).unwrap(),
        "source"
    );
    assert_eq!(
        fs::read_to_string(selected.path().join("to.md")).unwrap(),
        "external"
    );
}

#[test]
fn real_macos_watcher_emits_only_the_logical_committed_change_over_tauri() {
    let selected = tempfile::tempdir().unwrap();
    let app = app();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let token = app
        .state::<VaultRegistry>()
        .register_selected_path_for_test("main", selected.path())
        .unwrap();

    let registration =
        invoke_mock(&webview, "vault_watch", json!({ "vaultToken": token })).unwrap();
    let event_name = registration["event"].as_str().unwrap().to_owned();
    let (sender, receiver) = mpsc::channel();
    let listener_id = app.listen(event_name, move |event| {
        let _ = sender.send(event.payload().to_owned());
    });

    invoke_mock(
        &webview,
        "vault_write_text_atomic",
        json!({
            "vaultToken": token,
            "path": "note.md",
            "text": "complete",
            "expectedHash": null
        }),
    )
    .unwrap();

    let deadline = Instant::now() + Duration::from_secs(5);
    let mut payloads = Vec::new();
    while Instant::now() < deadline {
        match receiver.recv_timeout(Duration::from_millis(150)) {
            Ok(payload) => {
                payloads.push(payload);
                if payloads.iter().any(|payload| payload.contains("note.md")) {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(error) => panic!("watch channel disconnected: {error}"),
        }
    }
    app.unlisten(listener_id);

    assert_eq!(
        payloads.len(),
        1,
        "raw/temp watcher events leaked: {payloads:?}"
    );
    let payload: serde_json::Value = serde_json::from_str(&payloads[0]).unwrap();
    assert_eq!(payload["kind"], "created");
    assert_eq!(payload["path"], "note.md");
    assert!(!payloads[0].contains(".studio-"));
}

#[test]
fn revoking_a_window_drops_tokens_and_watchers() {
    let selected = tempfile::tempdir().unwrap();
    let app = app();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let registry = app.state::<VaultRegistry>();
    let token = registry
        .register_selected_path_for_test("main", selected.path())
        .unwrap();
    assert_eq!(registry.capability_count_for_test(), 1);
    drop(webview);
    revoke_window(&registry, "main");
    assert_eq!(registry.capability_count_for_test(), 0);
    assert!(registry.vault_for_test("main", &token).is_err());
}
