fn main() {
    // `sqlx::migrate!` embeds the files of migrations/ but is not told when a new
    // one appears: without this line an incremental build could ship without it.
    println!("cargo:rerun-if-changed=migrations");

    // Android has no process plugin; the program registers its own under that
    // name (src/mobile.rs), and declares its permissions here so that the one
    // capability file (`process:default`, `process:allow-restart`) resolves on
    // both. On a desktop the real plugin declares them.
    let mut attributes = tauri_build::Attributes::new();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        attributes = attributes.plugin(
            "process",
            tauri_build::InlinedPlugin::new()
                .commands(&["restart", "exit"])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        );
    }
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
