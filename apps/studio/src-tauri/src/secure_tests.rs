use std::{
    ffi::CString,
    fs,
    os::fd::AsRawFd,
    sync::{Arc, Barrier, mpsc},
    time::{Duration, Instant},
};

use serde_json::json;
use tauri::{Listener, Manager, test, webview::InvokeRequest};

use crate::{
    commands::vault::{Vault, VaultRegistry},
    handle_window_event, studio_builder,
};

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
fn native_recovery_identity_survives_reselection_without_disclosing_the_vault_path() {
    let first_vault = tempfile::tempdir().unwrap();
    let second_vault = tempfile::tempdir().unwrap();

    let first_process = VaultRegistry::default();
    let first_selection = first_process
        .register_selected_path_selection_for_test("main", first_vault.path())
        .unwrap();
    drop(first_process);

    let reloaded_process = VaultRegistry::default();
    let reselected = reloaded_process
        .register_selected_path_selection_for_test("main", first_vault.path())
        .unwrap();
    let different = reloaded_process
        .register_selected_path_selection_for_test("main", second_vault.path())
        .unwrap();

    assert_eq!(first_selection.recovery_identity, reselected.recovery_identity);
    assert_ne!(first_selection.vault_token, reselected.vault_token);
    assert_ne!(reselected.recovery_identity, different.recovery_identity);
    assert_eq!(reselected.recovery_identity.len(), 32);
    assert!(
        reselected
            .recovery_identity
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    );
    for selection in [&first_selection, &reselected, &different] {
        let encoded = serde_json::to_string(selection).unwrap();
        assert!(!encoded.contains(first_vault.path().to_str().unwrap()));
        assert!(!encoded.contains(second_vault.path().to_str().unwrap()));
    }
    assert_eq!(
        fs::read_to_string(first_vault.path().join(".studio-vault-id")).unwrap(),
        reselected.recovery_identity
    );
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
fn direct_reads_reject_a_fifo_without_blocking() {
    let selected = tempfile::tempdir().unwrap();
    let fifo = selected.path().join("pipe");
    let fifo_name = CString::new(fifo.as_os_str().as_encoded_bytes()).unwrap();
    // SAFETY: `fifo_name` is NUL-terminated and points to a path owned by this test.
    assert_eq!(unsafe { libc::mkfifo(fifo_name.as_ptr(), 0o600) }, 0);
    let registry = VaultRegistry::default();
    let token = registry
        .register_selected_path_for_test("main", selected.path())
        .unwrap();
    let vault = registry.vault_for_test("main", &token).unwrap();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let text = vault.read_text("pipe");
        let binary = vault.read_binary_for_test("pipe");
        sender.send((text, binary)).unwrap();
    });

    let (text, binary) = receiver
        .recv_timeout(Duration::from_millis(500))
        .expect("FIFO read blocked instead of rejecting the special file");
    assert!(matches!(
        text,
        Err(crate::commands::vault::VaultError::Unavailable)
    ));
    assert!(matches!(
        binary,
        Err(crate::commands::vault::VaultError::Unavailable)
    ));
}

#[test]
fn ipc_reserves_the_internal_studio_namespace() {
    let selected = tempfile::tempdir().unwrap();
    fs::write(selected.path().join("note.md"), "public").unwrap();
    let app = app();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let token = app
        .state::<VaultRegistry>()
        .register_selected_path_for_test("main", selected.path())
        .unwrap();

    let attempts = [
        (
            "vault_read_text",
            json!({ "vaultToken": token, "path": ".studio-write.lock" }),
        ),
        (
            "vault_read_text",
            json!({ "vaultToken": token, "path": ".STUDIO-write.lock" }),
        ),
        (
            "vault_read_binary",
            json!({ "vaultToken": token, "path": ".studio-write.lock" }),
        ),
        (
            "vault_write_text_atomic",
            json!({ "vaultToken": token, "path": ".studio-write.lock", "text": "attack", "expectedHash": null }),
        ),
        (
            "vault_write_binary_atomic",
            json!({ "vaultToken": token, "path": ".studio-write.lock", "bytes": [1, 2, 3] }),
        ),
        (
            "vault_move",
            json!({ "vaultToken": token, "from": "note.md", "to": ".studio-write.lock" }),
        ),
        (
            "vault_move",
            json!({ "vaultToken": token, "from": ".studio-write.lock", "to": "stolen.md" }),
        ),
        (
            "vault_remove",
            json!({ "vaultToken": token, "path": ".studio-write.lock" }),
        ),
        (
            "vault_list",
            json!({ "vaultToken": token, "prefix": ".studio-write.lock" }),
        ),
        (
            "vault_exists",
            json!({ "vaultToken": token, "path": ".studio-write.lock" }),
        ),
    ];
    for (command, body) in attempts {
        assert_eq!(
            invoke_mock(&webview, command, body).unwrap_err(),
            json!("path_escape")
        );
    }
    let entries = invoke_mock(
        &webview,
        "vault_list",
        json!({ "vaultToken": token, "prefix": null }),
    )
    .unwrap();
    assert!(!entries.to_string().contains(".studio-"));
    assert_eq!(
        fs::read_to_string(selected.path().join("note.md")).unwrap(),
        "public"
    );
    assert_ne!(
        fs::read_to_string(selected.path().join(".studio-write.lock")).unwrap(),
        "attack"
    );
}

#[test]
fn cooperative_external_writer_is_never_clobbered_by_a_conditional_write() {
    let selected = tempfile::tempdir().unwrap();
    fs::write(selected.path().join("note.md"), "original").unwrap();

    let registry = VaultRegistry::default();
    let token = registry
        .register_selected_path_for_test("main", selected.path())
        .unwrap();
    let vault = registry.vault_for_test("main", &token).unwrap();
    let expected = vault.read_text("note.md").unwrap().hash;
    let lock_file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(selected.path().join(".studio-write.lock"))
        .unwrap();
    let path = selected.path().join("note.md");
    let (locked_sender, locked_receiver) = mpsc::channel();
    let external = std::thread::spawn(move || {
        assert_eq!(
            unsafe { libc::flock(lock_file.as_raw_fd(), libc::LOCK_EX) },
            0
        );
        fs::write(path, "external").unwrap();
        locked_sender.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(120));
        assert_eq!(
            unsafe { libc::flock(lock_file.as_raw_fd(), libc::LOCK_UN) },
            0
        );
    });
    locked_receiver.recv().unwrap();
    let started = Instant::now();
    let result = vault.write_text_atomic_for_test("note.md", "ours", Some(&expected));
    let waited = started.elapsed();
    external.join().unwrap();
    assert!(matches!(
        result,
        Err(crate::commands::vault::VaultError::Conflict)
    ));
    assert!(
        waited >= Duration::from_millis(80),
        "write bypassed the shared lock"
    );
    assert_eq!(
        fs::read_to_string(selected.path().join("note.md")).unwrap(),
        "external"
    );
}

#[test]
fn two_selections_of_one_vault_allow_only_one_expected_hash_writer() {
    let selected = tempfile::tempdir().unwrap();
    fs::write(selected.path().join("note.md"), "original").unwrap();
    let registry = VaultRegistry::default();
    let first_token = registry
        .register_selected_path_for_test("first", selected.path())
        .unwrap();
    let second_token = registry
        .register_selected_path_for_test("second", selected.path())
        .unwrap();
    let first = registry.vault_for_test("first", &first_token).unwrap();
    let second = registry.vault_for_test("second", &second_token).unwrap();
    let expected = first.read_text("note.md").unwrap().hash;
    let barrier = Arc::new(Barrier::new(3));

    let spawn_writer = |vault: Arc<Vault>, text: &'static str| {
        let barrier = Arc::clone(&barrier);
        let expected = expected.clone();
        std::thread::spawn(move || {
            barrier.wait();
            vault.write_text_atomic_for_test("note.md", text, Some(&expected))
        })
    };
    let first_writer = spawn_writer(first, "first");
    let second_writer = spawn_writer(second, "second");
    barrier.wait();
    let results = [first_writer.join().unwrap(), second_writer.join().unwrap()];

    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(result, Err(crate::commands::vault::VaultError::Conflict)))
            .count(),
        1
    );
    assert!(matches!(
        fs::read_to_string(selected.path().join("note.md"))
            .unwrap()
            .as_str(),
        "first" | "second"
    ));
}

#[test]
fn ipc_enforces_conditional_text_binary_and_remove_operations() {
    let selected = tempfile::tempdir().unwrap();
    let app = app();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let token = app
        .state::<VaultRegistry>()
        .register_selected_path_for_test("main", selected.path())
        .unwrap();

    invoke_mock(
        &webview,
        "vault_write_text_atomic",
        json!({
            "vaultToken": token,
            "path": "note.md",
            "text": "first",
            "expectedHash": null,
            "expectedMissing": true
        }),
    )
    .unwrap();
    assert_eq!(
        invoke_mock(
            &webview,
            "vault_write_text_atomic",
            json!({
                "vaultToken": token,
                "path": "note.md",
                "text": "clobber",
                "expectedHash": null,
                "expectedMissing": true
            }),
        )
        .unwrap_err(),
        json!("conflict")
    );

    let created = invoke_mock(
        &webview,
        "vault_write_binary_atomic",
        json!({
            "vaultToken": token,
            "path": "asset.bin",
            "bytes": [1, 2, 3],
            "expectedHash": null,
            "expectedMissing": true
        }),
    )
    .unwrap();
    assert_eq!(
        invoke_mock(
            &webview,
            "vault_write_binary_atomic",
            json!({
                "vaultToken": token,
                "path": "asset.bin",
                "bytes": [9],
                "expectedHash": null,
                "expectedMissing": true
            }),
        )
        .unwrap_err(),
        json!("conflict")
    );
    assert_eq!(
        invoke_mock(
            &webview,
            "vault_read_binary",
            json!({ "vaultToken": token, "path": "asset.bin" }),
        )
        .unwrap(),
        json!([1, 2, 3])
    );

    let replaced = invoke_mock(
        &webview,
        "vault_write_binary_atomic",
        json!({
            "vaultToken": token,
            "path": "asset.bin",
            "bytes": [4, 5, 6],
            "expectedHash": created["hash"],
            "expectedMissing": false
        }),
    )
    .unwrap();
    assert_eq!(
        invoke_mock(
            &webview,
            "vault_remove",
            json!({
                "vaultToken": token,
                "path": "asset.bin",
                "expectedHash": null,
                "expectedMissing": true
            }),
        )
        .unwrap_err(),
        json!("conflict")
    );
    assert_eq!(
        invoke_mock(
            &webview,
            "vault_remove",
            json!({
                "vaultToken": token,
                "path": "asset.bin",
                "expectedHash": created["hash"],
                "expectedMissing": false
            }),
        )
        .unwrap_err(),
        json!("conflict")
    );
    assert_eq!(
        invoke_mock(
            &webview,
            "vault_read_binary",
            json!({ "vaultToken": token, "path": "asset.bin" }),
        )
        .unwrap(),
        json!([4, 5, 6])
    );
    invoke_mock(
        &webview,
        "vault_remove",
        json!({
            "vaultToken": token,
            "path": "asset.bin",
            "expectedHash": replaced["hash"],
            "expectedMissing": false
        }),
    )
    .unwrap();
    assert!(!selected.path().join("asset.bin").exists());
}

#[test]
fn two_selections_allow_only_one_conditional_binary_create() {
    let selected = tempfile::tempdir().unwrap();
    let registry = VaultRegistry::default();
    let first_token = registry
        .register_selected_path_for_test("first", selected.path())
        .unwrap();
    let second_token = registry
        .register_selected_path_for_test("second", selected.path())
        .unwrap();
    let first = registry.vault_for_test("first", &first_token).unwrap();
    let second = registry.vault_for_test("second", &second_token).unwrap();
    let barrier = Arc::new(Barrier::new(3));

    let spawn_writer = |vault: Arc<Vault>, bytes: &'static [u8]| {
        let barrier = Arc::clone(&barrier);
        std::thread::spawn(move || {
            barrier.wait();
            vault.write_binary_atomic_for_test("asset.bin", bytes, None, true)
        })
    };
    let first_writer = spawn_writer(first, &[1, 2, 3]);
    let second_writer = spawn_writer(second, &[4, 5, 6]);
    barrier.wait();
    let results = [first_writer.join().unwrap(), second_writer.join().unwrap()];

    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(result, Err(crate::commands::vault::VaultError::Conflict)))
            .count(),
        1
    );
    assert!(matches!(
        fs::read(selected.path().join("asset.bin"))
            .unwrap()
            .as_slice(),
        [1, 2, 3] | [4, 5, 6]
    ));
}

#[test]
fn uncooperative_external_writer_before_publish_is_detected_without_a_swap() {
    let selected = tempfile::tempdir().unwrap();
    fs::write(selected.path().join("note.md"), "original").unwrap();

    let registry = VaultRegistry::default();
    let token = registry
        .register_selected_path_for_test("main", selected.path())
        .unwrap();
    let vault = registry.vault_for_test("main", &token).unwrap();
    let expected = vault.read_text("note.md").unwrap().hash;
    let external_path = selected.path().join("note.md");

    let result = vault.write_text_atomic_with_before_commit_for_test(
        "note.md",
        "ours",
        Some(&expected),
        || fs::write(external_path, "external").unwrap(),
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

fn collect_until_quiet(
    receiver: &mpsc::Receiver<String>,
    first_timeout: Duration,
    quiet_period: Duration,
) -> Vec<String> {
    let mut payloads = Vec::new();
    let mut deadline = Instant::now() + first_timeout;
    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(remaining.min(Duration::from_millis(50))) {
            Ok(payload) => {
                payloads.push(payload);
                deadline = Instant::now() + quiet_period;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(error) => panic!("watch channel disconnected: {error}"),
        }
    }
    payloads
}

#[test]
fn watcher_follows_retained_root_after_selected_path_is_replaced() {
    let parent = tempfile::tempdir().unwrap();
    let selected = parent.path().join("selected");
    let retained = parent.path().join("retained");
    let retained_again = parent.path().join("retained-again");
    fs::create_dir(&selected).unwrap();
    let app = app();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let token = app
        .state::<VaultRegistry>()
        .register_selected_path_for_test("main", &selected)
        .unwrap();

    let vault = app
        .state::<VaultRegistry>()
        .vault_for_test("main", &token)
        .unwrap();
    let registration = vault
        .start_watch_with_registration_hooks_for_test(
            app.handle().clone(),
            || {},
            || {
                fs::rename(&selected, &retained).unwrap();
                fs::create_dir(&selected).unwrap();
            },
        )
        .unwrap();
    let event_name = registration.event;
    let (sender, receiver) = mpsc::channel();
    let listener_id = app.listen(event_name, move |event| {
        let _ = sender.send(event.payload().to_owned());
    });

    fs::write(selected.join("outside.md"), "must not be watched").unwrap();
    let outside_payloads = collect_until_quiet(
        &receiver,
        Duration::from_millis(350),
        Duration::from_millis(200),
    );
    assert!(
        outside_payloads.is_empty(),
        "replacement path leaked: {outside_payloads:?}"
    );

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

    let payloads = collect_until_quiet(
        &receiver,
        Duration::from_secs(5),
        Duration::from_millis(400),
    );
    assert_eq!(
        payloads.len(),
        1,
        "raw/temp watcher events leaked: {payloads:?}"
    );
    let payload: serde_json::Value = serde_json::from_str(&payloads[0]).unwrap();
    assert_eq!(payload["kind"], "created");
    assert_eq!(payload["path"], "note.md");
    assert!(!payloads[0].contains(".studio-"));

    fs::rename(&retained, &retained_again).unwrap();
    fs::create_dir(&retained).unwrap();
    fs::write(
        retained.join("also-outside.md"),
        "must not retarget an established watcher",
    )
    .unwrap();
    let retargeted_payloads = collect_until_quiet(
        &receiver,
        Duration::from_millis(350),
        Duration::from_millis(200),
    );
    app.unlisten(listener_id);
    assert!(
        retargeted_payloads.is_empty(),
        "established watcher retargeted to replacement: {retargeted_payloads:?}"
    );
}

#[test]
fn watcher_aba_never_discloses_outside_content_and_periodically_reconciles() {
    let parent = tempfile::tempdir().unwrap();
    let selected = parent.path().join("selected");
    let retained = parent.path().join("retained");
    let retained_after_registration = parent.path().join("retained-after-registration");
    let impostor = parent.path().join("impostor");
    let watched_impostor = parent.path().join("watched-impostor");
    fs::create_dir(&selected).unwrap();
    fs::create_dir(&impostor).unwrap();
    let app = app();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let token = app
        .state::<VaultRegistry>()
        .register_selected_path_for_test("main", &selected)
        .unwrap();
    let vault = app
        .state::<VaultRegistry>()
        .vault_for_test("main", &token)
        .unwrap();

    let registration = vault
        .start_watch_with_registration_hooks_for_test(
            app.handle().clone(),
            || {
                fs::rename(&selected, &retained).unwrap();
                fs::rename(&impostor, &selected).unwrap();
            },
            || {
                fs::rename(&selected, &watched_impostor).unwrap();
                fs::rename(&retained, &selected).unwrap();
            },
        )
        .unwrap();
    let watch_id = registration.id.clone();
    let (sender, receiver) = mpsc::channel();
    let listener_id = app.listen(registration.event, move |event| {
        let _ = sender.send(event.payload().to_owned());
    });

    fs::write(watched_impostor.join("outside.md"), "secret").unwrap();
    let outside = collect_until_quiet(
        &receiver,
        Duration::from_millis(500),
        Duration::from_millis(200),
    );
    assert!(
        outside.is_empty(),
        "outside watcher content leaked: {outside:?}"
    );

    vault.drop_native_watcher_for_test(&watch_id);
    fs::rename(&selected, &retained_after_registration).unwrap();
    fs::create_dir(&selected).unwrap();
    invoke_mock(
        &webview,
        "vault_write_text_atomic",
        json!({
            "vaultToken": token,
            "path": "retained.md",
            "text": "inside",
            "expectedHash": null
        }),
    )
    .unwrap();
    let reconciled = collect_until_quiet(
        &receiver,
        Duration::from_secs(4),
        Duration::from_millis(400),
    );
    app.unlisten(listener_id);
    assert_eq!(
        reconciled.len(),
        1,
        "periodic reconciliation failed: {reconciled:?}"
    );
    let payload: serde_json::Value = serde_json::from_str(&reconciled[0]).unwrap();
    assert_eq!(payload["path"], "retained.md");
    assert!(!reconciled[0].contains("outside.md"));
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
    handle_window_event(&registry, "main", &tauri::WindowEvent::Destroyed);
    assert_eq!(registry.capability_count_for_test(), 0);
    assert!(registry.vault_for_test("main", &token).is_err());
}

#[test]
fn studio_builder_registers_the_production_window_event_callback() {
    let source = include_str!("lib.rs");
    assert!(source.contains(".on_window_event(|window, event|"));
    assert!(
        source.contains(
            "handle_window_event(&window.state::<VaultRegistry>(), window.label(), event);"
        )
    );
}
