fn main() {
    // `sqlx::migrate!` embeds the files of migrations/ but is not told when a new
    // one appears: without this line an incremental build could ship without it.
    println!("cargo:rerun-if-changed=migrations");
    tauri_build::build()
}
