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
//!
//! Three more things here are part of the data model, not of taste
//! (docs/data-model/DESIGN.md section 5):
//!
//! - **The one connection is never recycled.** sqlx closes a pooled connection
//!   after thirty minutes by default. A transaction is several IPC calls, so a
//!   connection replaced between two of them would roll back the statements
//!   before the swap and commit those after it one by one.
//! - **`foreign_keys` and `recursive_triggers` are connect options.** A PRAGMA
//!   sent once would be lost on a reconnect, and without `recursive_triggers`
//!   an `INSERT OR REPLACE` rewrites an issued invoice without firing the
//!   trigger that forbids its deletion.
//! - **The webview may send one statement at a time, from a short list**
//!   ([`check_statement`]). Only the migrations change the schema.

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
        // Enforced per-connection in SQLite, and off by default.
        .foreign_keys(true)
        // So that the REPLACE conflict rule fires delete triggers: the
        // append-only tables rely on them.
        .pragma("recursive_triggers", "ON")
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        // Wait rather than fail if the file is briefly locked (e.g. by a backup).
        .busy_timeout(std::time::Duration::from_secs(10));

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        // Opened at start and kept: never closed for being idle or old.
        .min_connections(1)
        .max_lifetime(None)
        .idle_timeout(None)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await.map_err(|error| {
        CommandError::new(format!("database migration failed: {error}"))
    })?;

    Ok(pool)
}

/// The first words a statement from the webview may start with.
///
/// Everything else is for the migrations only: DROP, ALTER, CREATE, PRAGMA,
/// ATTACH, VACUUM, REPLACE. The triggers that keep invoices and the log
/// append-only are worth nothing if the same channel can drop them.
const ALLOWED_STATEMENTS: [&str; 8] = [
    "select", "with", "insert", "update", "delete", "begin", "commit", "rollback",
];

/// Accepts exactly one statement, of an allowed kind.
///
/// This is a guard against mistakes and casual tampering, not a parser: it
/// reads the first keyword and looks for a second statement after a `;`,
/// stepping over strings, quoted names and comments so that a semicolon inside
/// a value is not taken for one.
pub(crate) fn check_statement(sql: &str) -> Result<(), CommandError> {
    let bytes = sql.as_bytes();
    let mut i = 0;
    let mut first_word: Option<String> = None;
    let mut ended = false;

    while i < bytes.len() {
        let c = bytes[i];
        // Comments.
        if c == b'-' && bytes.get(i + 1) == Some(&b'-') {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if c == b'/' && bytes.get(i + 1) == Some(&b'*') {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(bytes.len());
            continue;
        }
        if c.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        // Anything else after the terminating semicolon is a second statement.
        if ended {
            return Err(CommandError::new("only one statement at a time is accepted"));
        }
        if c == b';' {
            ended = true;
            i += 1;
            continue;
        }
        // Strings and quoted names: skip to the closing quote ('' and "" are escapes).
        if c == b'\'' || c == b'"' || c == b'`' || c == b'[' {
            let close = if c == b'[' { b']' } else { c };
            i += 1;
            loop {
                match bytes.get(i) {
                    None => return Err(CommandError::new("unterminated quote in statement")),
                    Some(&b) if b == close => {
                        if close != b']' && bytes.get(i + 1) == Some(&close) {
                            i += 2;
                            continue;
                        }
                        i += 1;
                        break;
                    }
                    Some(_) => i += 1,
                }
            }
            if first_word.is_none() {
                first_word = Some(String::new());
            }
            continue;
        }
        if first_word.is_none() {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_alphabetic() || bytes[i] == b'_') {
                i += 1;
            }
            first_word = Some(sql[start..i].to_ascii_lowercase());
            if i == start {
                i += 1;
            }
            continue;
        }
        i += 1;
    }

    match first_word.as_deref() {
        Some(word) if ALLOWED_STATEMENTS.contains(&word) => Ok(()),
        _ => Err(CommandError::new("this kind of statement is not accepted")),
    }
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
    check_statement(&sql)?;

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
    check_statement(&sql)?;

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

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("inmaa-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    /// The migrations, applied by the engine that ships.
    ///
    /// The JavaScript tests and the browser harness run the same SQL files on
    /// Node's SQLite, which is a newer release than the one sqlx compiles in. A
    /// migration that leans on something newer would pass there and then stop
    /// the program at start on the client's PC. This is the test that says no.
    #[test]
    fn migrations_apply_on_the_shipped_engine() {
        let dir = temp_dir("db-test");
        let path = dir.join(DB_FILE);

        tauri::async_runtime::block_on(async {
            let pool = open(&path).await.expect("the migrations apply to an empty file");

            let count = |kind: &'static str| {
                let pool = pool.clone();
                async move {
                    sqlx::query_scalar::<_, i64>(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type = ?1 AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_sqlx%' ESCAPE '\\'",
                    )
                    .bind(kind)
                    .fetch_one(&pool)
                    .await
                    .expect("the schema can be read")
                }
            };
            // The data model: 109 tables and 122 triggers (0001 made 107 and 120;
            // 0003 adds the two service lists, each with its no-delete trigger;
            // 0004 adds two columns to StaffMember).
            assert_eq!(count("table").await, 109, "tables");
            assert_eq!(count("trigger").await, 122, "triggers");
            let added: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info('StaffMember') WHERE name IN ('trialEndDate', 'fixedTermReason') AND type = 'TEXT' AND \"notnull\" = 0",
            )
            .fetch_one(&pool)
            .await
            .expect("StaffMember's columns");
            assert_eq!(added, 2, "0004: trialEndDate and fixedTermReason");

            let not_strict: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_sqlx%' ESCAPE '\\' AND strict = 0",
            )
            .fetch_one(&pool)
            .await
            .expect("table list");
            assert_eq!(not_strict, 0, "every table is STRICT");

            for (pragma, expected) in [("foreign_keys", 1), ("recursive_triggers", 1)] {
                let value: i64 = sqlx::query_scalar(&format!("PRAGMA {pragma}"))
                    .fetch_one(&pool)
                    .await
                    .expect("pragma");
                assert_eq!(value, expected, "{pragma} must be on for the one connection");
            }

            // The seed migration: seven roles, the system one among them.
            let roles: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM \"Role\"").fetch_one(&pool).await.expect("roles");
            assert_eq!(roles, 7);
            let violations = sqlx::query("PRAGMA foreign_key_check").fetch_all(&pool).await.expect("fk check");
            assert!(violations.is_empty(), "the seeded rows satisfy every foreign key");

            // What every later launch does: open a file that is already up to
            // date. Nothing is left to apply and no checksum disagrees.
            pool.close().await;
            let again = open(&path).await.expect("an up-to-date file opens again");
            again.close().await;
        });

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// An installed copy upgrades in place. The first installer carried 0001
    /// and 0002; a database it made opens with this program, which applies the
    /// later migrations at start (0003 creates tables, 0004 adds columns to one
    /// 0001 created) and keeps every row that was there.
    #[test]
    fn a_database_of_the_first_installer_upgrades_in_place() {
        let dir = temp_dir("db-upgrade");
        let path = dir.join(DB_FILE);
        let shipped = dir.join("shipped");
        std::fs::create_dir_all(&shipped).expect("dir");
        std::fs::write(shipped.join("0001_init.sql"), include_str!("../migrations/0001_init.sql")).expect("0001");
        std::fs::write(shipped.join("0002_seed.sql"), include_str!("../migrations/0002_seed.sql")).expect("0002");

        tauri::async_runtime::block_on(async {
            let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", path.to_string_lossy()))
                .expect("path")
                .create_if_missing(true)
                .foreign_keys(true)
                .pragma("recursive_triggers", "ON");
            let pool = SqlitePoolOptions::new().max_connections(1).connect_with(options).await.expect("connect");
            sqlx::migrate::Migrator::new(shipped.as_path())
                .await
                .expect("the first installer's migrations")
                .run(&pool)
                .await
                .expect("the first installer's database");
            sqlx::query("INSERT INTO \"Zone\" (\"id\", \"name\", \"createdAt\", \"updatedAt\") VALUES ('zone-kept', 'عين البيضاء', '2026-10-20T08:00:00.000Z', '2026-10-20T08:00:00.000Z')")
                .execute(&pool)
                .await
                .expect("a row of the office's");
            // An employee the first installer's database holds: 0004 adds two columns to her table.
            sqlx::query("INSERT INTO \"StaffMember\" (\"id\", \"kind\", \"numberSeq\", \"number\", \"registrationDate\", \"lastName\", \"firstName\", \"sex\", \"phone\", \"nameKey\", \"phoneKeys\", \"engagementStatus\", \"branchId\", \"createdAt\", \"updatedAt\") VALUES ('staff-kept', 'EMPLOYEE', 1, '1', '2026-10-20', 'حمدي', 'رضا', 'MALE', '0661203142', 'حمدي رضا', '|0661203142|', 'ACCEPTED', 'branch-main', '2026-10-20T08:00:00.000Z', '2026-10-20T08:00:00.000Z')")
                .execute(&pool)
                .await
                .expect("an employee of the office's");
            pool.close().await;

            let pool = open(&path).await.expect("the installed database upgrades");
            let scalar = |sql: &'static str| {
                let pool = pool.clone();
                async move { sqlx::query_scalar::<_, i64>(sql).fetch_one(&pool).await.expect(sql) }
            };
            assert_eq!(scalar("SELECT COUNT(*) FROM \"Zone\" WHERE \"id\" = 'zone-kept'").await, 1, "the office's rows stay");
            assert_eq!(scalar("SELECT COUNT(*) FROM \"CatalogueService\"").await, 48, "his 48 services");
            assert_eq!(
                scalar("SELECT COUNT(*) FROM \"StaffMember\" WHERE \"id\" = 'staff-kept' AND \"trialEndDate\" IS NULL AND \"fixedTermReason\" IS NULL").await,
                1,
                "0004: the employee stays, with no trial period and no fixed-term reason"
            );
            sqlx::query("UPDATE \"StaffMember\" SET \"trialEndDate\" = '2027-01-20', \"fixedTermReason\" = 'remplacement' WHERE \"id\" = 'staff-kept'")
                .execute(&pool)
                .await
                .expect("0004: a trial end date and a reason are kept");
            assert!(
                sqlx::query("UPDATE \"StaffMember\" SET \"trialEndDate\" = '20/01/2027' WHERE \"id\" = 'staff-kept'")
                    .execute(&pool)
                    .await
                    .is_err(),
                "0004: trialEndDate is a calendar date, YYYY-MM-DD"
            );
            assert_eq!(
                scalar("SELECT COUNT(*) FROM \"_sqlx_migrations\" WHERE \"success\" = 1").await,
                sqlx::migrate!("./migrations").iter().count() as i64,
                "every embedded migration applied"
            );
            pool.close().await;
        });

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[derive(serde::Deserialize)]
    struct Tape {
        migration: String,
        steps: Vec<Step>,
    }

    #[derive(serde::Deserialize)]
    struct Step {
        k: String,
        sql: String,
        p: Vec<SqlValue>,
        /// For a refusal: the part of the message both engines word alike.
        e: Option<String>,
        /// For a read that succeeded: the row, or null.
        #[serde(default)]
        r: Option<serde_json::Value>,
    }

    /// The data model's proof, replayed on the engine that ships.
    ///
    /// `scripts/db/model-proof.mjs` makes 157 attempts to break the database's
    /// rules (append-only tables, the hash chains, the legal sequences, frozen
    /// pay runs, the cached totals) and records every statement it ran and how
    /// Node's SQLite answered. Here the same statements run, in the same
    /// order, on sqlx's SQLite, and each must be accepted or refused in the
    /// same way and read back the same row.
    #[test]
    fn the_model_proof_holds_on_the_shipped_engine() {
        let tape: Tape = serde_json::from_str(include_str!("../proof/model-proof.tape.json")).expect("the tape parses");
        assert_eq!(tape.migration, "0001_init.sql");
        assert!(tape.steps.len() > 300, "the tape holds the whole proof");

        let dir = temp_dir("proof");
        let path = dir.join("proof.db");

        tauri::async_runtime::block_on(async {
            // The program's own connection options, and the schema migration
            // alone: the proof writes its own rows.
            let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", path.to_string_lossy()))
                .expect("path")
                .create_if_missing(true)
                .foreign_keys(true)
                .pragma("recursive_triggers", "ON");
            let pool = SqlitePoolOptions::new().max_connections(1).connect_with(options).await.expect("connect");
            sqlx::raw_sql(include_str!("../migrations/0001_init.sql"))
                .execute(&pool)
                .await
                .expect("the schema migration applies");

            let mut refused = 0;
            for (index, step) in tape.steps.iter().enumerate() {
                let outcome = if step.k == "get" {
                    bind_all(sqlx::query(&step.sql), &step.p)
                        .fetch_optional(&pool)
                        .await
                        .map(|row| row.map(|row| row_to_json(&row).expect("a row converts")))
                } else {
                    bind_all(sqlx::query(&step.sql), &step.p).execute(&pool).await.map(|_| None)
                };

                match (&step.e, outcome) {
                    (None, Ok(row)) => {
                        if step.k == "get" {
                            let expected = step.r.clone().unwrap_or(serde_json::Value::Null);
                            let got = row.unwrap_or(serde_json::Value::Null);
                            assert_eq!(got, expected, "step {index}: {} read a different row", step.sql);
                        }
                    }
                    (Some(expected), Err(error)) => {
                        refused += 1;
                        let message = error.to_string();
                        assert!(
                            message.contains(expected.as_str()),
                            "step {index}: {} was refused with `{message}`, expected `{expected}`",
                            step.sql
                        );
                    }
                    (None, Err(error)) => panic!("step {index}: {} was refused here: {error}", step.sql),
                    (Some(expected), Ok(_)) => panic!("step {index}: {} was accepted here; expected `{expected}`", step.sql),
                }
            }
            assert!(refused > 100, "the proof is mostly refusals: {refused}");
            pool.close().await;
        });

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_webview_may_send_one_allowed_statement() {
        for accepted in [
            "select 1",
            "  SELECT * FROM \"User\" WHERE \"name\" = 'a;b'",
            "with x as (select 1) insert into t select * from x",
            "insert into \"Setting\" (\"id\") values (?)",
            "INSERT OR REPLACE INTO t VALUES (1)",
            "update t set a = 'x -- not a comment' where id = ?",
            "delete from t where id = ?;",
            "BEGIN",
            "begin immediate",
            "COMMIT",
            "ROLLBACK",
            "-- a note\nselect 1",
            "/* a note */ select 1 ;  ",
            "select \"a;b\" from t",
        ] {
            assert!(check_statement(accepted).is_ok(), "{accepted} must be accepted");
        }

        for refused in [
            "",
            "   ",
            "drop trigger \"Invoice_no_update\"",
            "DROP TABLE \"AuditLog\"",
            "alter table t add column x",
            "create table t (a)",
            "pragma foreign_keys = off",
            "PRAGMA recursive_triggers = OFF",
            "attach database 'x' as y",
            "vacuum",
            "replace into t values (1)",
            "savepoint a",
            "select 1; drop table t",
            "select 1; select 2",
            "update t set a = 1; -- then\ndelete from t",
            "/* select */ drop table t",
            "-- select\ndrop table t",
            "'select' 1",
            "select 'unterminated",
        ] {
            assert!(check_statement(refused).is_err(), "{refused} must be refused");
        }
    }
}
