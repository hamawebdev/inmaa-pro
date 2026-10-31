use tauri::{AppHandle, Manager};
use tauri_specta::{collect_commands, Builder};

mod anchor;
mod backup;
mod db;
mod sync;

/// A serializable error type for fallible Tauri commands.
/// The frontend receives the `message` string (and a typed shape via tauri-specta).
#[derive(Debug, thiserror::Error, serde::Serialize, specta::Type)]
#[error("{message}")]
pub struct CommandError {
    pub message: String,
}

impl CommandError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

/// Build the tauri-specta command registry. Shared by `run()` and the
/// `export_bindings` test so generated TypeScript always matches the app.
fn specta_builder() -> Builder {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        db::db_select,
        db::db_execute,
        db::db_checkpoint,
        db::db_path,
        backup::backup_to,
        backup::restore_from,
        backup::export_upload,
        backup::save_text_file,
        backup::backup_manifest,
        backup::backup_folder_check,
        backup::backup_rotate,
        backup::restore_pending,
        backup::restore_pending_clear,
        anchor::anchor_read,
        anchor::anchor_write,
        sync::sync_set_origin,
        sync::sync_vault_read,
        sync::sync_vault_write,
        sync::sync_vault_clear,
        sync::db_snapshot,
        sync::file_info,
        sync::file_commit,
        sync::file_remove,
        sync::sync_tmp_clear,
        sync::sync_install_copy,
        sync::sync_install_pending,
        sync::sync_install_pending_clear,
        // Not here: the three that carry raw bytes (sync::RAW_COMMANDS), which
        // tauri-specta cannot type. `run()` routes them to sync::raw_handler.
    ])
}

// ── Windows ────────────────────────────────────────────────────────────────

/// The program's one window. Full capability: filesystem, dialogs, store, printing.
const MAIN_WINDOW: &str = "main";

/// Builds a window declared in tauri.conf.json, by label.
///
/// It is declared there with `"create": false` and built here, because a window
/// Tauri builds by itself from the config gets no navigation guard: this is
/// where the guard is attached. Its size, title and minimum stay in the config.
fn build_window(app: &AppHandle, label: &str) -> Result<tauri::WebviewWindow, String> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == label)
        .cloned()
        .ok_or_else(|| format!("no window labelled {label} in tauri.conf.json"))?;

    tauri::WebviewWindowBuilder::from_config(app, &config)
        .map_err(|e| e.to_string())?
        // Offline, enforced rather than assumed: the window shows the program
        // and nothing else. The content security policy in tauri.conf.json
        // stops a page from *loading* anything remote; these two stop it from
        // *going* anywhere, whatever a link or a stored value says.
        .on_navigation(is_app_url)
        .on_new_window(|_url, _features| tauri::webview::NewWindowResponse::Deny)
        .build()
        .map_err(|e| e.to_string())
}

/// Whether a navigation stays inside the program.
///
/// The bundled app is served from `tauri://localhost` on Linux and macOS. On
/// Windows, WebView2 cannot register a custom scheme, so Tauri maps the same
/// thing to `http://tauri.localhost`. The Vite dev server is allowed in debug
/// builds only; a release build refuses it like any other address.
fn is_app_url(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost")
                || (cfg!(debug_assertions)
                    && matches!(url.host_str(), Some("localhost" | "127.0.0.1")))
        }
        // The blank page a webview starts on.
        "about" => url.as_str() == "about:blank",
        _ => false,
    }
}

/// Writes the typed TypeScript client to `src/lib/bindings.ts`.
/// Only compiled in debug builds; the `@ts-nocheck` header keeps the
/// generated file out of the project's lint/type-check.
#[cfg(debug_assertions)]
fn export_bindings(builder: &Builder) {
    builder
        .export(
            specta_typescript::Typescript::default()
                .header("// @ts-nocheck\n/* eslint-disable */\n")
                // `i64` (SqlValue::Int, ExecuteResult::last_insert_id) has no
                // exact TypeScript counterpart, so specta refuses to guess by
                // default. Tauri's IPC is JSON, so these already arrive in JS as
                // `number` — `Number` is what the wire actually carries. Values
                // past 2^53 would lose precision, which SQLite rowids and the
                // integers this schema stores never approach.
                .bigint(specta_typescript::BigIntExportBehavior::Number),
            "../src/lib/bindings.ts",
        )
        .expect("failed to export typescript bindings");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    // Regenerate TypeScript bindings on every dev build.
    #[cfg(debug_assertions)]
    export_bindings(&builder);

    let mut app = tauri::Builder::default();

    // Desktop-only plugins. `single_instance` must be registered first —
    // it also stops a second window from opening the same SQLite file.
    //
    // No updater plugin: it requires a `plugins.updater` block with a signing
    // pubkey, and registering it without one aborts startup (Tauri passes a
    // missing plugin config through as JSON null, which fails to deserialise
    // into its Config). An app that never talks to a network has nothing to
    // update from anyway.
    #[cfg(desktop)]
    {
        app = app
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_process::init());
    }

    // No opener plugin: nothing in this program opens a browser, a mail client
    // or a dialler. See `is_app_url` above and src/lib/offline.test.ts.
    app.plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler({
            let typed = builder.invoke_handler();
            move |invoke| {
                if sync::RAW_COMMANDS.contains(&invoke.message.command()) {
                    sync::raw_handler(invoke)
                } else {
                    typed(invoke)
                }
            }
        })
        .setup(move |app| {
            builder.mount_events(app);

            // Open the database and run migrations before the webview can issue
            // any query. Failing here is fatal: without storage there is no app.
            let handle = app.handle().clone();
            let pool = tauri::async_runtime::block_on(db::init(&handle))
                .expect("failed to initialise the database");
            app.manage(db::Db(pool));

            // The program opens straight on its window: no licence, no trial.
            build_window(app.handle(), MAIN_WINDOW)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Generates `src/lib/bindings.ts`. Run with `cargo test export_bindings`.
    #[test]
    fn export_bindings() {
        super::export_bindings(&specta_builder());
    }

    fn url(text: &str) -> tauri::Url {
        text.parse().expect("a valid URL")
    }

    #[test]
    fn the_window_stays_inside_the_program() {
        // Where the bundled app lives, per platform.
        assert!(is_app_url(&url("tauri://localhost/index.html")));
        assert!(is_app_url(&url("http://tauri.localhost/index.html")));
        assert!(is_app_url(&url("https://tauri.localhost/")));
        assert!(is_app_url(&url("about:blank")));

        // Everything else is refused: the open web, the local disk, other
        // schemes a stored value or a link could carry.
        for outside in [
            "https://example.com/",
            "http://192.168.1.10/",
            "http://tauri.localhost.example.com/",
            "tauri://example.com/",
            "file:///etc/passwd",
            "asset://localhost/uploads/x.png",
            "tel:0555000000",
            "mailto:someone@example.com",
            "data:text/html,hello",
            "about:srcdoc",
        ] {
            assert!(!is_app_url(&url(outside)), "{outside} must be refused");
        }

        // The dev server is reachable from a debug build and from nothing else.
        assert_eq!(is_app_url(&url("http://localhost:1420/")), cfg!(debug_assertions));
    }
}
