use tauri::{AppHandle, Manager};
use tauri_specta::{collect_commands, Builder};

mod backup;
mod db;
pub mod license;

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

/// Lets `license::guard`'s refusal travel out of a command with `?`.
///
/// The guard deliberately returns a bare string that says nothing about why the
/// installation is locked — see its docs — and this carries that string through
/// unchanged rather than dressing it up.
impl From<String> for CommandError {
    fn from(message: String) -> Self {
        Self { message }
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
        // The only three commands without a `license::guard`. They are what a
        // locked installation is allowed to ask, and between them they can do
        // nothing but report the licence, accept a code, and restart.
        license::license_status,
        license::license_unlock,
        license::license_restart,
    ])
}

// ── Windows ────────────────────────────────────────────────────────────────

/// The app proper. Full capability: filesystem, dialogs, store, printing.
const MAIN_WINDOW: &str = "main";

/// The trial-expired screen. Its capability grants `core:default` and nothing
/// else (see capabilities/lock.json), so the webview behind it cannot reach the
/// database or the disk however it is persuaded to try.
const LOCK_WINDOW: &str = "lock";

/// Builds one of the windows declared in tauri.conf.json, by label.
///
/// Both are declared there with `"create": false` — Tauri would otherwise build
/// them both at startup, which is the one thing the licence module exists to
/// prevent. Declaring them in config and building here keeps every dimension,
/// title and minimum in the one file an editor expects to find them in, while
/// leaving *which* window opens to the licence.
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

/// Ages the trial once a minute for as long as the app is open, and closes the
/// app down onto the lock screen the moment it runs out.
///
/// A plain OS thread rather than an async task: the tick writes to SQLite
/// through its own connection and wants a blocking sleep, and this way it needs
/// no timer runtime and cannot starve the UI.
///
/// It stops on either ending. Expiry swaps the window; an activation from
/// Settings leaves a centre with no countdown left to run, and a thread waking
/// every minute to age a licence that can no longer change is just a thread.
///
/// The swap itself is dispatched to the main thread, because that is where a
/// window may be created and destroyed. The main window is closed *before* the
/// lock window opens, so there is no moment where a fully-permissioned webview
/// and an expired licence exist together.
fn spawn_license_ticker(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(license::TICK_SECS));

        match tauri::async_runtime::block_on(license::tick(&handle)) {
            license::Status::Expired => {}
            // Bought while the app was open. Nothing left to count.
            license::Status::Unlocked => break,
            license::Status::Trial => continue,
        }

        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let _ = window.close();
            }
            if let Err(e) = build_window(&app, LOCK_WINDOW) {
                eprintln!("error: could not open the lock window: {e}");
                app.exit(1);
            }
        });
        break;
    });
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
                // Either window, because a locked installation has only the
                // second one — focusing "main" alone would do nothing there.
                if let Some(window) = app
                    .get_webview_window(MAIN_WINDOW)
                    .or_else(|| app.get_webview_window(LOCK_WINDOW))
                {
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
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);

            // Asked FIRST, before anything can create the file. `db::init` is
            // moments away and creates it, so asking afterwards would always
            // answer "yes" — and would tell a brand-new PC it had been wiped.
            let db_existed = db::database_path(app.handle())
                .map(|path| path.exists())
                .unwrap_or(false);

            // Open the database and run migrations before the webview can issue
            // any query. Failing here is fatal: without storage there is no app.
            let handle = app.handle().clone();
            let pool = tauri::async_runtime::block_on(db::init(&handle))
                .expect("failed to initialise the database");
            app.manage(db::Db(pool));

            // THE decision, and it is taken here — before a window exists,
            // before the frontend has run a line, and by Rust. Migrations having
            // already run costs a locked install nothing: it never gets a
            // webview that may ask for the data.
            let status =
                tauri::async_runtime::block_on(license::evaluate(app.handle(), db_existed));

            if status == license::Status::Expired {
                build_window(app.handle(), LOCK_WINDOW)?;
            } else {
                build_window(app.handle(), MAIN_WINDOW)?;
                if status == license::Status::Trial {
                    spawn_license_ticker(app.handle());
                }
            }

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
        assert!(is_app_url(&url("tauri://localhost/lock.html")));
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
