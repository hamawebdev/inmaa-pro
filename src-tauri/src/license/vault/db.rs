//! The sixth anchor: a row inside the centre's own `inmaa.db`.
//!
//! It pulls in the opposite direction to the other five and that is the point.
//! The registry keys and the `Microsoft\…` folders survive an uninstall but not
//! a fresh Windows profile; this one goes wherever the database goes, including
//! into the centre's backups and back out of a restore. Between them, the
//! record has to be hunted down in two quite different places to be removed.
//!
//! It carries its own `CREATE TABLE IF NOT EXISTS` rather than joining the
//! migrations in `src-tauri/migrations/`, for isolation: licensing owns its
//! storage end to end, the app's schema history stays about centres, and the
//! generated Kysely types in `src/lib/db/schema.ts` — built from `schema.prisma`
//! — do not grow a table they have no business knowing about.

use std::path::Path;
use std::time::Duration;

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Connection, Row, SqliteConnection};

/// The single row this module owns.
const KEY: &str = "record";

/// A short-lived connection of its own, rather than the app's pool.
///
/// The pool is deliberately `max_connections(1)` (see `db.rs`) and is busy
/// serving the Kysely driver whenever the app is running, so borrowing it here
/// would put the licence behind the app's query traffic. A second connection
/// under WAL costs nothing and blocks nobody.
///
/// The `busy_timeout` is this module's one deviation from the reference
/// implementation: with a single-connection pool on the other side, a writer
/// holding the file for a moment (a backup checkpoint, a long transaction) would
/// otherwise silently cost us this anchor.
async fn connect(db_path: &Path) -> Option<SqliteConnection> {
    SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .busy_timeout(Duration::from_secs(5))
        .connect()
        .await
        .ok()
}

pub async fn read(db_path: &Path) -> Option<String> {
    let mut conn = connect(db_path).await?;
    let row = sqlx::query("SELECT value FROM _license WHERE key = ?1")
        .bind(KEY)
        .fetch_optional(&mut conn)
        .await
        .ok()
        .flatten();
    let _ = conn.close().await;

    // A missing table is a missing anchor, not an error — this is the ordinary
    // state of a database from before the licence existed.
    row.and_then(|r| r.try_get::<String, _>("value").ok())
        .filter(|s| !s.trim().is_empty())
}

pub async fn write(db_path: &Path, encoded: &str) {
    let Some(mut conn) = connect(db_path).await else {
        return;
    };

    // Best-effort throughout, like every other anchor: a read-only or locked
    // database loses this one copy and the other five still carry the record.
    let _ = sqlx::query("CREATE TABLE IF NOT EXISTS _license (key TEXT PRIMARY KEY, value TEXT)")
        .execute(&mut conn)
        .await;
    let _ = sqlx::query(
        "INSERT INTO _license (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(KEY)
    .bind(encoded)
    .execute(&mut conn)
    .await;

    let _ = conn.close().await;
}
