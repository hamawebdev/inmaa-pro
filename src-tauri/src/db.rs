//! The application database.
//!
//! We own the SQLite connection here rather than using `tauri-plugin-sql`.
//! That plugin opens a default multi-connection `sqlx::Pool` and hands an
//! arbitrary connection to each `select`/`execute` call, so a `BEGIN` issued by
//! one IPC call and the statements after it can land on different connections —
//! which would silently break the transactions the ported server actions rely
//! on (student/teacher deletion cascades soft-deletes across seven tables).
//!
//! With `max_connections(1)` every statement runs on the same connection, so
//! `BEGIN` / `COMMIT` / `ROLLBACK` issued as separate calls behave correctly.
//! Kysely's driver on the TypeScript side serialises access so two transactions
//! can never interleave on that shared connection.

use serde::{Deserialize, Serialize};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteRow, SqliteSynchronous},
    Column, Row, SqlitePool, TypeInfo, ValueRef,
};
use std::{path::PathBuf, str::FromStr};
use tauri::{Manager, State};

use crate::CommandError;

/// Live connection pool (max 1 connection — see module docs).
pub struct Db(pub SqlitePool);

/// The database file inside the app data directory. Named once, here: backup,
/// restore and the licence anchor all ask for this constant.
pub(crate) const DB_FILE: &str = "inmaa.db";

/// A parameter value crossing the IPC boundary. Mirrors the JSON types Kysely
/// produces when it compiles a query.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(untagged)]
pub enum SqlValue {
    Null,
    Bool(bool),
    Int(i64),
    Real(f64),
    Text(String),
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    pub rows_affected: u32,
    pub last_insert_id: i64,
}

impl From<sqlx::Error> for CommandError {
    fn from(error: sqlx::Error) -> Self {
        CommandError {
            message: error.to_string(),
        }
    }
}

/// Where the database lives. Also asked by `license::db_path` (for the anchor
/// kept inside it) and by `run()` (to learn whether the file existed *before*
/// this launch created it), so the path is defined once here rather than
/// rebuilt by each caller.
///
/// Creating the directory is part of resolving the path — the callers above all
/// want a usable location, and an empty directory is not a database.
pub(crate) fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::new(format!("cannot resolve app data dir: {error}")))?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| CommandError::new(format!("cannot create app data dir: {error}")))?;
    Ok(dir.join(DB_FILE))
}

/// Opens (creating if needed) the database, applies migrations, and returns the
/// pool. Called once during `setup`.
pub async fn init(app: &tauri::AppHandle) -> Result<SqlitePool, CommandError> {
    open(&database_path(app)?).await
}

/// Opens the database at `path` and brings it up to date.
///
/// Separate from [`init`] so that the test at the bottom of this file drives
/// exactly what the program runs at start: the same connection options, the
/// same embedded migrations, on the SQLite that is compiled into the program.
pub(crate) async fn open(path: &std::path::Path) -> Result<SqlitePool, CommandError> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", path.to_string_lossy()))
        .map_err(|error| CommandError::new(format!("invalid database path: {error}")))?
        .create_if_missing(true)
        // Enforced per-connection in SQLite, and off by default. The schema
        // leans on ON DELETE CASCADE, so this is not optional.
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        // Wait rather than fail if the file is briefly locked (e.g. by a backup).
        .busy_timeout(std::time::Duration::from_secs(10));

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await.map_err(|error| {
        CommandError::new(format!("database migration failed: {error}"))
    })?;

    Ok(pool)
}

fn bind_all<'q>(
    mut query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    params: &'q [SqlValue],
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    for param in params {
        query = match param {
            SqlValue::Null => query.bind(None::<String>),
            SqlValue::Bool(value) => query.bind(*value),
            SqlValue::Int(value) => query.bind(*value),
            SqlValue::Real(value) => query.bind(*value),
            SqlValue::Text(value) => query.bind(value.as_str()),
        };
    }
    query
}

/// Converts one result row into a JSON object keyed by column name.
///
/// Column types come from SQLite's dynamic typing, so we dispatch on the
/// declared type of the value actually stored. Everything the schema uses maps
/// onto TEXT / INTEGER / REAL / NULL; BLOB is decoded as a byte array for
/// completeness rather than because the app stores any.
fn row_to_json(row: &SqliteRow) -> Result<serde_json::Value, CommandError> {
    let mut object = serde_json::Map::with_capacity(row.columns().len());

    for column in row.columns() {
        let name = column.name();
        let raw = row.try_get_raw(column.ordinal())?;

        let value = if raw.is_null() {
            serde_json::Value::Null
        } else {
            match raw.type_info().name() {
                "TEXT" => serde_json::Value::String(row.try_get::<String, _>(column.ordinal())?),
                "INTEGER" | "NUMERIC" | "BOOLEAN" | "INT8" => {
                    serde_json::Value::from(row.try_get::<i64, _>(column.ordinal())?)
                }
                "REAL" | "FLOAT" | "DOUBLE" => {
                    serde_json::Value::from(row.try_get::<f64, _>(column.ordinal())?)
                }
                "BLOB" => serde_json::Value::from(row.try_get::<Vec<u8>, _>(column.ordinal())?),
                // COUNT(*) and other expressions can report an unexpected type;
                // fall back through the widest lossless representations.
                _ => {
                    if let Ok(value) = row.try_get::<i64, _>(column.ordinal()) {
                        serde_json::Value::from(value)
                    } else if let Ok(value) = row.try_get::<f64, _>(column.ordinal()) {
                        serde_json::Value::from(value)
                    } else {
                        serde_json::Value::String(row.try_get::<String, _>(column.ordinal())?)
                    }
                }
            }
        };

        object.insert(name.to_string(), value);
    }

    Ok(serde_json::Value::Object(object))
}

/// Runs a query and returns its rows. Used by the Kysely driver for anything
/// that produces a result set (including `RETURNING`).
#[tauri::command]
#[specta::specta]
pub async fn db_select(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    sql: String,
    params: Vec<SqlValue>,
) -> Result<Vec<serde_json::Value>, CommandError> {
    crate::license::guard(&app)?;

    let rows = bind_all(sqlx::query(&sql), &params)
        .fetch_all(&db.0)
        .await?;

    rows.iter().map(row_to_json).collect()
}

/// Runs a statement that produces no rows. Also how the Kysely driver issues
/// BEGIN / COMMIT / ROLLBACK.
#[tauri::command]
#[specta::specta]
pub async fn db_execute(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    sql: String,
    params: Vec<SqlValue>,
) -> Result<ExecuteResult, CommandError> {
    crate::license::guard(&app)?;

    let result = bind_all(sqlx::query(&sql), &params)
        .execute(&db.0)
        .await?;

    Ok(ExecuteResult {
        rows_affected: result.rows_affected() as u32,
        last_insert_id: result.last_insert_rowid(),
    })
}

/// Flushes the WAL into the main database file so it can be copied as a single
/// self-contained file. Used by backup before handing the path to the user.
#[tauri::command]
#[specta::specta]
pub async fn db_checkpoint(app: tauri::AppHandle, db: State<'_, Db>) -> Result<(), CommandError> {
    crate::license::guard(&app)?;

    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE);")
        .execute(&db.0)
        .await?;
    Ok(())
}

/// Absolute path of the database file, for backup/restore.
#[tauri::command]
#[specta::specta]
pub async fn db_path(app: tauri::AppHandle) -> Result<String, CommandError> {
    crate::license::guard(&app)?;

    Ok(database_path(&app)?.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The migrations, applied by the engine that ships.
    ///
    /// The JavaScript tests and the browser harness run the same SQL files on
    /// Node's SQLite, which is a newer release than the one sqlx compiles in. A
    /// migration that leans on something newer would pass there and then stop
    /// the program at start on the client's PC. This is the test that says no.
    #[test]
    fn migrations_apply_on_the_shipped_engine() {
        let dir = std::env::temp_dir().join(format!("inmaa-db-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join(DB_FILE);

        tauri::async_runtime::block_on(async {
            let pool = open(&path).await.expect("the migrations apply to an empty file");

            let tables: Vec<String> = sqlx::query_scalar(
                "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
            )
            .fetch_all(&pool)
            .await
            .expect("the schema can be read");
            for expected in ["Setting", "User"] {
                assert!(tables.iter().any(|t| t == expected), "table {expected} is missing");
            }

            let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
                .fetch_one(&pool)
                .await
                .expect("pragma");
            assert_eq!(foreign_keys, 1, "foreign keys must be enforced");

            // What every later launch does: open a file that is already up to
            // date. Nothing is left to apply and no checksum disagrees.
            pool.close().await;
            let again = open(&path).await.expect("an up-to-date file opens again");
            again.close().await;
        });

        let _ = std::fs::remove_dir_all(&dir);
    }
}
