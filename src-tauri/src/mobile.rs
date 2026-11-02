//! What Android needs that a desktop gets from its plugins.
//!
//! # «إعادة تشغيل البرنامج» on a phone
//!
//! On a laptop, installing a full copy (`sync_install_copy`) or restoring a
//! backup closes the database connection, swaps the files, and the window then
//! calls `relaunch()` from `@tauri-apps/plugin-process`: the process starts
//! again, opens the new file, runs its migrations, and the window reads the
//! install note at start.
//!
//! Android has no such plugin and an app cannot start its own process again.
//! So on Android the program registers its own plugin under the same name,
//! `process`, with the same two commands. `restart` does what a new process
//! would: it closes the connection (rolling back anything the old window left
//! open), opens a new one on the file now in place, with the same options and
//! migrations (`db::init`), and loads the window again from its first page.
//! Everything the window kept in memory is dropped with the page; what must
//! survive (the install note, the vault, the anchor) is on disk, read at the
//! next start exactly as after a desktop relaunch. The window's code is the
//! same on both: `relaunch()` works on the phone too.
//!
//! The plugin's permissions (`process:default`, `process:allow-restart`) are
//! declared for Android by build.rs, so the one capability file serves both.

use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Wry,
};

use crate::CommandError;

/// Opens the database again and reloads the window: a restart, on a phone.
#[tauri::command]
async fn restart(app: AppHandle) -> Result<(), CommandError> {
    let db = app.state::<crate::db::Db>();
    // Close first: an open transaction of the old window holds the write lock,
    // and the migrations of the new connection would wait on it.
    db.pool().close().await;
    let fresh = crate::db::init(&app).await?;
    db.replace(fresh);
    if let Some(window) = app.get_webview_window(crate::MAIN_WINDOW) {
        window
            .eval("window.location.replace('/')")
            .map_err(|error| CommandError::new(format!("could not reload the window: {error}")))?;
    }
    Ok(())
}

/// Leaves the program, as the desktop plugin's `exit` does.
#[tauri::command]
fn exit(app: AppHandle, code: i32) {
    app.exit(code)
}

/// The `process` plugin of the Android build.
pub fn process_plugin() -> TauriPlugin<Wry> {
    Builder::new("process")
        .invoke_handler(tauri::generate_handler![restart, exit])
        .build()
}
