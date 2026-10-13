/**
 * The harness's stand-in for the Rust side of the app.
 *
 * It answers the same commands the webview sends over Tauri IPC, from a real
 * SQLite file built by the target app's own migrations. One connection, as in
 * src-tauri/src/db.rs, so BEGIN / COMMIT sent as separate calls behave the same.
 *
 * Dev tooling only. Nothing here is imported by `src/`, and nothing here is in
 * the production bundle.
 *
 * Known differences from the real app (see README.md):
 *  - node:sqlite's SQLite is newer than the one sqlx bundles;
 *  - the licence is whatever the run asks for, never the real state;
 *  - dialogs always answer "cancelled".
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * node:sqlite prints an "experimental" warning when it is first loaded. It is
 * the same line on every run and says nothing about the app, so it is dropped
 * here and every other warning is left alone.
 */
async function loadSqlite() {
  const emitWarning = process.emitWarning;
  process.emitWarning = function (warning, ...rest) {
    if (String(warning).includes("SQLite is an experimental feature")) return;
    return emitWarning.call(process, warning, ...rest);
  };
  try {
    return await import("node:sqlite");
  } finally {
    process.emitWarning = emitWarning;
  }
}

/** Tauri's BaseDirectory.AppData. Every other base directory is refused. */
const BASE_DIR_APP_DATA = 14;

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

class CommandFailure extends Error {
  /** @param {unknown} payload what the webview's `invoke()` promise rejects with */
  constructor(payload, { unstubbed = false } = {}) {
    super(typeof payload === "string" ? payload : JSON.stringify(payload));
    this.payload = payload;
    this.unstubbed = unstubbed;
  }
}

/** The app's `CommandError { message }`, which is what its commands reject with. */
function commandError(message) {
  return new CommandFailure({ message });
}

/**
 * Binds values the way serde + sqlx do on the Rust side.
 *
 * `SqlValue` is an untagged enum of Null | Bool | Int(i64) | Real(f64) | Text,
 * so a JSON integer is bound as an INTEGER. node:sqlite binds every JS number
 * as a double, which would store `1.0` in a TEXT column and print `7.0` in a
 * string concatenation; going through BigInt keeps integers integers.
 */
function toSqlParams(command, params) {
  if (!Array.isArray(params)) {
    throw new CommandFailure(`invalid args \`params\` for command \`${command}\`: expected a sequence`);
  }
  return params.map((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value ? 1n : 0n;
    if (typeof value === "string") return value;
    if (typeof value === "number") return Number.isInteger(value) ? BigInt(value) : value;
    throw new CommandFailure(
      `invalid args \`params\` for command \`${command}\`: data did not match any variant of untagged enum SqlValue`,
    );
  });
}

/** Mirrors `row_to_json` in db.rs: a BLOB crosses the bridge as an array of bytes. */
function toJsonRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Uint8Array ? Array.from(value) : value;
  }
  return out;
}

/** sqlx prefixes SQLite's text; src/server/db-errors.ts matches on the tail. */
function sqliteError(error) {
  const code = error && typeof error.errcode === "number" ? error.errcode : 1;
  const text = error instanceof Error ? error.message : String(error);
  return commandError(`error returned from database: (code: ${code}) ${text}`);
}

/** The statements the app's two database commands accept (`ALLOWED_STATEMENTS` in src-tauri/src/db.rs). */
const ALLOWED_STATEMENTS = new Set(["select", "with", "insert", "update", "delete", "begin", "commit", "rollback"]);

/**
 * The same guard as `check_statement` in src-tauri/src/db.rs: one statement,
 * of an allowed kind. Strings, quoted names and comments are stepped over, so
 * a semicolon inside a value is not taken for a second statement.
 */
function checkStatement(sql) {
  let i = 0;
  let firstWord = null;
  let ended = false;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close === -1 ? sql.length : close + 2;
      continue;
    }
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (ended) throw commandError("only one statement at a time is accepted");
    if (c === ";") {
      ended = true;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === close) {
          if (close !== "]" && sql[i + 1] === close) {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      i += 1;
      if (firstWord === null) firstWord = "";
      continue;
    }
    if (firstWord === null) {
      let end = i;
      while (end < sql.length && /[A-Za-z_]/.test(sql[end])) end += 1;
      firstWord = sql.slice(i, end).toLowerCase();
      i = Math.max(end, i + 1);
      continue;
    }
    i += 1;
  }
  if (!firstWord || !ALLOWED_STATEMENTS.has(firstWord)) throw commandError("this kind of statement is not accepted");
}

function runSqlFile(sqlite, file, label) {
  const sql = fs.readFileSync(file, "utf8");
  sqlite.exec("BEGIN");
  try {
    sqlite.exec(sql);
    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {
      // Already rolled back by SQLite.
    }
    throw new Error(`${label} ${path.basename(file)} failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * @param {object} options
 * @param {string} options.root      the app being served (holds src-tauri/migrations)
 * @param {string} options.runDir    this run's throwaway directory
 * @param {string[]} [options.seeds] SQL files applied after the migrations
 * @param {"unlocked"|"trial"|"expired"} [options.license]
 * @param {string} [options.database] a database to start from instead of an empty one (the demo data):
 *   it is copied into this run, and already holds the migrations
 * @param {string} [options.anchor]   the anchor record to start from, copied beside it
 */
export async function createBackend({ root, runDir, seeds = [], license = "unlocked", database, anchor }) {
  const { DatabaseSync } = await loadSqlite();
  const appData = path.join(runDir, "appdata");
  fs.mkdirSync(appData, { recursive: true });
  const dbPath = path.join(appData, "harness.db");
  if (database) fs.copyFileSync(database, dbPath);

  const sqlite = new DatabaseSync(dbPath);
  // The same per-connection settings db.rs asks sqlx for. Without recursive_triggers an
  // INSERT OR REPLACE would rewrite an append-only row without firing its delete trigger.
  sqlite.exec(
    "PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
  );

  // The statement guard is this program's (src-tauri/src/db.rs). The reference app, which the
  // harness can also serve, has none: it is served as it was.
  const dbRs = path.join(root, "src-tauri", "src", "db.rs");
  const guarded = fs.existsSync(dbRs) && fs.readFileSync(dbRs, "utf8").includes("ALLOWED_STATEMENTS");

  // The anchor of the hash chains is kept outside the database and outside app data, as the
  // real one is (src-tauri/src/anchor.rs). Here: one file beside this run's app data.
  const anchorFile = path.join(runDir, "chain-anchor.json");
  if (anchor && fs.existsSync(anchor)) fs.copyFileSync(anchor, anchorFile);

  const migrationsDir = path.join(root, "src-tauri", "migrations");
  // A copied database already holds them.
  const migrations =
    !database && fs.existsSync(migrationsDir)
      ? fs
          .readdirSync(migrationsDir)
          .filter((name) => name.endsWith(".sql"))
          .sort()
      : [];
  // One transaction per file, as sqlx does.
  for (const name of migrations) runSqlFile(sqlite, path.join(migrationsDir, name), "migration");
  for (const seed of seeds) runSqlFile(sqlite, seed, "seed");

  /** Commands the app sent that the harness has no answer for. */
  const unstubbed = new Set();
  let closed = false;

  function insideAppData(target) {
    const resolved = path.resolve(target);
    const relative = path.relative(appData, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new CommandFailure(`forbidden path: ${target}`);
    }
    return resolved;
  }

  /** Resolves a plugin-fs `path` + `options.baseDir` pair inside the run's app data. */
  function fsPath(target, options) {
    if (typeof target !== "string") throw new CommandFailure("invalid path");
    const baseDir = options?.baseDir;
    if (baseDir === undefined || baseDir === null) return insideAppData(target);
    if (baseDir !== BASE_DIR_APP_DATA) throw new CommandFailure(`forbidden path: base directory ${baseDir}`);
    return insideAppData(path.join(appData, target));
  }

  function licenseStatus() {
    const day = 24 * 60 * 60 * 1000;
    return {
      state: license,
      remaining_ms: license === "trial" ? 5 * day : license === "expired" ? 0 : null,
      device_id: "HARN-ESS0-0000-0001",
      contact_phone: "0000000000",
      trial_days: 7,
    };
  }

  /**
   * @param {string} command
   * @param {any} args              the JSON arguments, or undefined for a raw body
   * @param {{ body?: Buffer, headers?: Record<string, string> }} [raw]
   */
  function invoke(command, args, raw) {
    switch (command) {
      // ── The app's own commands (src-tauri/src/lib.rs) ──────────────────
      case "db_select": {
        if (guarded) checkStatement(String(args?.sql));
        const params = toSqlParams(command, args?.params ?? []);
        try {
          return sqlite
            .prepare(String(args?.sql))
            .all(...params)
            .map(toJsonRow);
        } catch (error) {
          throw sqliteError(error);
        }
      }
      case "db_execute": {
        if (guarded) checkStatement(String(args?.sql));
        const params = toSqlParams(command, args?.params ?? []);
        try {
          const result = sqlite.prepare(String(args?.sql)).run(...params);
          return { rowsAffected: Number(result.changes ?? 0), lastInsertId: Number(result.lastInsertRowid ?? 0) };
        } catch (error) {
          throw sqliteError(error);
        }
      }
      case "db_checkpoint":
        sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
        return null;
      case "db_path":
        return dbPath;
      case "backup_to": {
        // A copy lands in this run's folder, whatever path was asked: the harness never writes outside it.
        const out = path.join(runDir, "backups");
        fs.mkdirSync(out, { recursive: true });
        const copy = path.join(out, path.basename(String(args?.target ?? "backup.db")));
        sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
        fs.copyFileSync(dbPath, copy);
        return {
          size_bytes: fs.statSync(copy).size,
          sha256: crypto.createHash("sha256").update(fs.readFileSync(copy)).digest("hex"),
        };
      }
      case "backup_folder_check": {
        const dir = String(args?.dir ?? "");
        const synced = /onedrive|dropbox|google drive/i.exec(dir);
        return {
          exists: dir !== "" && !/missing/i.test(dir),
          writable: !/readonly/i.test(dir),
          synced_by: synced ? synced[0] : null,
        };
      }
      case "backup_rotate":
        return [];
      case "backup_manifest":
      case "restore_pending":
        return null;
      case "restore_pending_clear":
        return null;
      case "restore_from":
        throw commandError("restoring is not available in the browser harness");
      case "save_text_file": {
        // What the program exports lands in this run's folder, where a check can read it.
        const out = path.join(runDir, "exports");
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(
          path.join(out, path.basename(String(args?.target ?? "export.txt"))),
          String(args?.contents ?? ""),
        );
        return null;
      }
      case "export_upload":
        // Never reached: the save dialog always answers "cancelled" here.
        throw commandError("saving a copy of an upload is not available in the browser harness");
      case "anchor_read":
        return fs.existsSync(anchorFile) ? fs.readFileSync(anchorFile, "utf8") : null;
      case "anchor_write":
        if (typeof args?.record !== "string") throw commandError("invalid anchor record");
        fs.writeFileSync(anchorFile, args.record);
        return null;
      case "license_status":
        return licenseStatus();
      case "license_unlock":
        return false;

      // ── Path ───────────────────────────────────────────────────────────
      case "plugin:path|resolve_directory":
        return args?.path ? path.join(appData, args.path) : appData;
      case "plugin:path|join":
        return path.join(...(args?.paths ?? []));
      case "plugin:path|resolve":
        return path.resolve(...(args?.paths ?? []));
      case "plugin:path|normalize":
        return path.normalize(args?.path ?? "");
      case "plugin:path|dirname":
        return path.dirname(args?.path ?? "");
      case "plugin:path|basename":
        return path.basename(args?.path ?? "", args?.ext ?? undefined);
      case "plugin:path|extname":
        return path.extname(args?.path ?? "").replace(/^\./, "");
      case "plugin:path|is_absolute":
        return path.isAbsolute(args?.path ?? "");

      // ── Filesystem, confined to this run's app data ────────────────────
      case "plugin:fs|exists":
        return fs.existsSync(fsPath(args?.path, args?.options));
      case "plugin:fs|mkdir":
        fs.mkdirSync(fsPath(args?.path, args?.options), { recursive: Boolean(args?.options?.recursive) });
        return null;
      case "plugin:fs|remove":
        fs.rmSync(fsPath(args?.path, args?.options), { recursive: Boolean(args?.options?.recursive), force: false });
        return null;
      case "plugin:fs|read_file":
        return Array.from(fs.readFileSync(fsPath(args?.path, args?.options)));
      case "plugin:fs|write_file": {
        const target = decodeURIComponent(raw?.headers?.path ?? "");
        const options = raw?.headers?.options ? JSON.parse(raw.headers.options) : undefined;
        fs.writeFileSync(fsPath(target, options), raw?.body ?? Buffer.alloc(0));
        return null;
      }

      // ── Dialogs: nobody is there to answer, so every one is cancelled ──
      case "plugin:dialog|open":
      case "plugin:dialog|save":
        return null;
      case "plugin:dialog|message":
      case "plugin:dialog|ask":
      case "plugin:dialog|confirm":
        return false;

      // ── Events and the rest of the shell ───────────────────────────────
      case "plugin:event|listen":
        return 0;
      case "plugin:event|unlisten":
      case "plugin:event|emit":
      case "plugin:event|emit_to":
      case "plugin:process|exit":
        return null;
      case "plugin:notification|is_permission_granted":
        return true;

      default:
        unstubbed.add(command);
        throw new CommandFailure(`harness: command not stubbed: ${command}`, { unstubbed: true });
    }
  }

  /** Serves `convertFileSrc()` URLs: files inside this run's app data, nothing else. */
  function readAsset(filePath) {
    const resolved = insideAppData(filePath);
    // The asset protocol's scope denies restricted uploads (tauri.conf.json): they are read
    // through the program, which checks who asks and writes the log.
    const restricted = path.join(appData, "uploads", "restricted");
    if (resolved === restricted || resolved.startsWith(restricted + path.sep)) return null;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
    return {
      body: fs.readFileSync(resolved),
      contentType: MIME[path.extname(resolved).toLowerCase()] ?? "application/octet-stream",
    };
  }

  function close() {
    if (closed) return;
    closed = true;
    try {
      sqlite.close();
    } catch {
      // Nothing useful to do with a failed close of a throwaway file.
    }
  }

  return { appData, dbPath, migrations, invoke, readAsset, unstubbed, close, CommandFailure };
}

export { CommandFailure };
