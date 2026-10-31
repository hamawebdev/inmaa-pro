use super::*;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("inmaa-sync-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

// ── The address ────────────────────────────────────────────────────────────

#[test]
fn the_mailbox_address_is_https_and_nothing_after_the_host() {
    for (typed, kept) in [
        (
            "https://inmaa-relay.example.workers.dev",
            "https://inmaa-relay.example.workers.dev",
        ),
        (
            "https://inmaa-relay.example.workers.dev/",
            "https://inmaa-relay.example.workers.dev",
        ),
        ("  HTTPS://Relay.Example.COM  ", "https://relay.example.com"),
        ("https://relay.example.com:8443", "https://relay.example.com:8443"),
        ("https://relay.example.com:443", "https://relay.example.com"),
    ] {
        assert_eq!(normalise_origin(typed).expect(typed), kept);
    }
    for refused in [
        "http://relay.example.com",
        "ftp://relay.example.com",
        "relay.example.com",
        "https://relay.example.com/v1/",
        "https://relay.example.com/anything",
        "https://relay.example.com?x=1",
        "https://relay.example.com#x",
        "https://user:pass@relay.example.com",
        "https://user@relay.example.com",
        "file:///etc/passwd",
        "",
    ] {
        let error = normalise_origin(refused).expect_err(refused);
        assert!(error.message.starts_with("REFUSED:"), "{refused}: {}", error.message);
    }
}

#[test]
fn only_paths_under_v1_methods_and_headers_of_the_list_are_sent() {
    let none: Vec<(String, String)> = Vec::new();
    let auth = vec![
        ("authorization".to_string(), "Bearer x".to_string()),
        ("x-relay-seq".to_string(), "3".to_string()),
    ];
    assert!(check_request("GET", "/v1/time", &none, 0).is_ok());
    assert!(check_request("PUT", "/v1/centres/abc/envelopes/12?key=k1&kind=tx", &auth, 1_500_000).is_ok());
    assert!(check_request("DELETE", "/v1/devices/d1", &auth, 0).is_ok());
    assert!(check_request(
        "POST",
        "/v1/centres",
        &vec![("x-setup-key".to_string(), "s".to_string())],
        10
    )
    .is_ok());

    for (method, path) in [
        ("GET", "/"),
        ("GET", "/v2/time"),
        ("GET", "v1/time"),
        ("GET", "/v1"),
        ("GET", "/v1/../admin"),
        ("GET", "/v1/./time"),
        ("GET", "/v1//time"),
        ("GET", "/v1/%2e%2e/admin"),
        ("GET", "/v1/a%2Fb"),
        ("GET", "/v1/time#x"),
        ("GET", "/v1/ti me"),
        ("GET", "/v1/time\r\nHost: x"),
        ("GET", "/v1/\\time"),
        ("PATCH", "/v1/time"),
        ("OPTIONS", "/v1/time"),
        ("get ", "/v1/time"),
    ] {
        let error = check_request(method, path, &none, 0).expect_err(path);
        assert!(error.message.starts_with("REFUSED:"), "{method} {path}");
    }
    let long = format!("/v1/{}", "a".repeat(2050));
    assert!(check_request("GET", &long, &none, 0).is_err());

    for name in [
        "host",
        "cookie",
        "x-forwarded-for",
        "origin",
        "connection",
        "transfer-encoding",
    ] {
        let headers = vec![(name.to_string(), "x".to_string())];
        assert!(
            check_request("GET", "/v1/time", &headers, 0).is_err(),
            "{name} must be refused"
        );
    }
    assert!(
        check_request("PUT", "/v1/x", &none, 4 * 1024 * 1024 + 1).is_err(),
        "too large"
    );
}

#[test]
fn the_answer_is_framed_as_the_window_reads_it() {
    let answer = http::Answer {
        status: 201,
        headers: vec![("x-relay-time".to_string(), "1793000000000".to_string())],
        body: vec![1, 2, 3],
    };
    let framed = frame(&answer);
    let head_len = u32::from_be_bytes(framed[0..4].try_into().unwrap()) as usize;
    let head: serde_json::Value = serde_json::from_slice(&framed[4..4 + head_len]).expect("head");
    assert_eq!(head["status"], 201);
    assert_eq!(head["headers"]["x-relay-time"], "1793000000000");
    assert_eq!(&framed[4 + head_len..], &[1, 2, 3]);
}

// ── The vault ──────────────────────────────────────────────────────────────

#[test]
fn the_vault_keeps_its_contents_and_its_address() {
    let dir = temp_dir("vault");
    assert!(vault::read(&dir).unwrap().is_none(), "nothing before sync is set up");
    assert!(vault::origin(&dir).unwrap().is_none());

    // A joining laptop sets the address on an empty vault.
    vault::set_origin(&dir, "https://relay.example.com").expect("origin");
    assert_eq!(
        vault::origin(&dir).unwrap().as_deref(),
        Some("https://relay.example.com")
    );

    // The rest written without the address: the address stays.
    vault::replace(&dir, r#"{"v":1,"centreId":"c1","deviceId":"d1","slot":1,"token":"t","keyRing":{"current":"k1","keys":{"k1":"AAAA"}}}"#)
        .expect("write");
    let read = vault::read(&dir).unwrap().expect("a vault");
    assert_eq!(read["origin"], "https://relay.example.com");
    assert_eq!(read["keyRing"]["keys"]["k1"], "AAAA");
    assert_eq!(read["slot"], 1);

    // The same address may be repeated; another may not be written this way.
    vault::replace(&dir, r#"{"origin":"https://relay.example.com","v":2}"#).expect("same origin");
    assert_eq!(vault::read(&dir).unwrap().unwrap()["v"], 2);
    let refused = vault::replace(&dir, r#"{"origin":"https://evil.example.com","v":3}"#).expect_err("another origin");
    assert!(refused.message.starts_with("REFUSED:"));
    assert_eq!(vault::read(&dir).unwrap().unwrap()["v"], 2, "nothing written");
    assert!(vault::replace(&dir, "[1,2]").is_err());
    assert!(vault::replace(&dir, "not json").is_err());

    // Written whole: no partial file left beside it; this user's alone.
    assert!(!dir.join(format!("{VAULT_FILE}.partial")).exists());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dir.join(VAULT_FILE)).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    vault::clear(&dir).expect("clear");
    assert!(vault::read(&dir).unwrap().is_none());
    vault::clear(&dir).expect("clearing twice is fine");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn without_an_address_nothing_is_sent_and_a_new_vault_needs_set_origin() {
    let dir = temp_dir("vault-empty");
    let refused = vault::replace(&dir, r#"{"origin":"https://relay.example.com"}"#).expect_err("origin by write");
    assert!(refused.message.starts_with("REFUSED:"));
    vault::replace(&dir, r#"{"v":1}"#).expect("a vault without an address");
    assert!(vault::origin(&dir).unwrap().is_none());
    let _ = std::fs::remove_dir_all(&dir);
}

// ── Files ──────────────────────────────────────────────────────────────────

#[test]
fn a_file_command_stays_inside_the_programs_folders() {
    let base = Path::new("/data/app");
    assert_eq!(
        confine(base, "uploads/StaffMember/photoUrl/a.png", &[UPLOADS, TMP]),
        Some(base.join("uploads/StaffMember/photoUrl/a.png"))
    );
    assert_eq!(
        confine(base, "sync-tmp/full-copy.db", &[TMP]),
        Some(base.join("sync-tmp/full-copy.db"))
    );

    for crafted in [
        "inmaa.db",
        "sync-vault.json",
        "uploads",
        "sync-tmp",
        "protected/inmaa-pre-join.db",
        "../inmaa.db",
        "uploads/../inmaa.db",
        "uploads/./a.png",
        "uploads//a.png",
        "/etc/passwd",
        "uploads/C:secret",
        "uploads\\..\\inmaa.db",
        "uploads/a.png.",
        "uploads/a\0.png",
        "",
    ] {
        assert_eq!(
            confine(base, crafted, &[UPLOADS, TMP]),
            None,
            "{crafted:?} must be refused"
        );
    }
    // Writing and committing are narrower still.
    assert_eq!(confine(base, "uploads/a/b/c.png", &[TMP]), None);
    assert_eq!(confine(base, "sync-tmp/x", &[UPLOADS]), None);
}

#[cfg(unix)]
#[test]
fn a_folder_that_links_outside_is_refused() {
    let base = temp_dir("link");
    let outside = temp_dir("link-outside");
    std::os::unix::fs::symlink(&outside, base.join("uploads")).expect("link");
    assert_eq!(confine(&base, "uploads/a.png", &[UPLOADS]), None);
    let _ = std::fs::remove_dir_all(&base);
    let _ = std::fs::remove_dir_all(&outside);
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

#[test]
fn a_file_arrives_in_parts_and_is_put_in_place_only_when_whole() {
    let base = temp_dir("parts");
    let bytes: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
    let hash = sha256_hex(&bytes);

    // In two parts, the second sent twice (a retry after a cut).
    write_part(&base, "sync-tmp/blob-1", 0, &bytes[..200_000]).expect("part 1");
    write_part(&base, "sync-tmp/blob-1", 200_000, &bytes[200_000..]).expect("part 2");
    write_part(&base, "sync-tmp/blob-1", 200_000, &bytes[200_000..]).expect("part 2 again");
    assert!(
        write_part(&base, "sync-tmp/blob-1", 400_000, b"x").is_err(),
        "a hole is refused"
    );
    assert!(
        write_part(&base, "uploads/a.png", 0, b"x").is_err(),
        "parts land in sync-tmp only"
    );

    let got = info(&base, "sync-tmp/blob-1").unwrap().expect("there");
    assert_eq!(got.sha256, hash);
    assert_eq!(got.size_bytes, 300_000.0);
    assert_eq!(
        read_part(&base, "sync-tmp/blob-1", 299_990, 100).unwrap(),
        bytes[299_990..].to_vec()
    );

    // A wrong hash: nothing put in place, the bad file removed.
    write_part(&base, "sync-tmp/blob-2", 0, b"not it").unwrap();
    let mismatch = commit(&base, "sync-tmp/blob-2", "uploads/E/f/b.png", &hash).expect_err("mismatch");
    assert!(mismatch.message.starts_with("MISMATCH:"));
    assert!(!base.join("uploads/E/f/b.png").exists() && !base.join("sync-tmp/blob-2").exists());

    commit(&base, "sync-tmp/blob-1", "uploads/E/f/a.png", &hash.to_uppercase()).expect("commit");
    assert_eq!(std::fs::read(base.join("uploads/E/f/a.png")).unwrap(), bytes);
    assert!(!base.join("sync-tmp/blob-1").exists());
    assert_eq!(info(&base, "uploads/E/f/a.png").unwrap().unwrap().sha256, hash);
    assert!(info(&base, "uploads/E/f/none.png").unwrap().is_none());

    // The same file again: fine. Other bytes under that name: a conflict, nothing replaced.
    write_part(&base, "sync-tmp/blob-3", 0, &bytes).unwrap();
    commit(&base, "sync-tmp/blob-3", "uploads/E/f/a.png", &hash).expect("same bytes");
    write_part(&base, "sync-tmp/blob-4", 0, b"other").unwrap();
    let conflict = commit(&base, "sync-tmp/blob-4", "uploads/E/f/a.png", &sha256_hex(b"other")).expect_err("conflict");
    assert!(conflict.message.starts_with("CONFLICT:"));
    assert_eq!(std::fs::read(base.join("uploads/E/f/a.png")).unwrap(), bytes);

    assert!(
        commit(&base, "sync-tmp/blob-4", "sync-tmp/elsewhere", &sha256_hex(b"other")).is_err(),
        "files go to uploads/"
    );
    assert!(
        commit(&base, "sync-tmp/blob-4", "uploads/x.png", "abc").is_err(),
        "a hash is 64 hex digits"
    );
    assert!(read_part(&base, "uploads/E/f/a.png", 0, MAX_PART + 1).is_err());
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn a_header_path_is_percent_decoded() {
    assert_eq!(
        percent_decode("sync-tmp%2Fblob%201").as_deref(),
        Some("sync-tmp/blob 1")
    );
    assert_eq!(percent_decode("uploads/%D8%A3.png").as_deref(), Some("uploads/أ.png"));
    assert_eq!(percent_decode("bad%2"), None);
    assert_eq!(percent_decode("bad%zz"), None);
}

#[test]
fn the_protected_copy_is_named_by_the_utc_time() {
    let at = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_793_000_000);
    assert_eq!(utc_stamp(at), "20261026T073320");
    assert_eq!(utc_stamp(std::time::UNIX_EPOCH), "19700101T000000");
    let leap = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_709_208_000); // 2024-02-29 12:00 UTC
    assert_eq!(utc_stamp(leap), "20240229T120000");
}

// ── The full copy ──────────────────────────────────────────────────────────

/// A database as this program makes it, with a database id and one row of the office's.
async fn program_database(path: &Path, id: &str, zone: &str) -> sqlx::SqlitePool {
    let pool = crate::db::open(path).await.expect("the migrations apply");
    sqlx::query(r#"INSERT INTO "Setting" ("id", "key", "value", "updatedAt") VALUES ('s1', 'system.databaseId', ?1, '2026-10-12T08:00:00.000Z')"#)
        .bind(format!("\"{id}\""))
        .execute(&pool)
        .await
        .expect("the id");
    sqlx::query(r#"INSERT INTO "Zone" ("id", "name", "createdAt", "updatedAt") VALUES (?1, ?1, '2026-10-20T08:00:00.000Z', '2026-10-20T08:00:00.000Z')"#)
        .bind(zone)
        .execute(&pool)
        .await
        .expect("a zone");
    pool
}

async fn scalar(path: &Path, sql: &str) -> String {
    let pool = crate::db::open(path).await.expect("open");
    let value: String = sqlx::query_scalar(sql).fetch_one(&pool).await.expect(sql);
    pool.close().await;
    value
}

#[test]
fn a_snapshot_is_a_whole_database_in_sync_tmp() {
    let base = temp_dir("snapshot");
    tauri::async_runtime::block_on(async {
        let pool = program_database(&base.join(crate::db::DB_FILE), "db-a", "zone-a").await;
        let copy = snapshot(&pool, &base, "full-copy.db").await.expect("snapshot");
        assert_eq!(copy.path, "sync-tmp/full-copy.db");
        assert!(copy.size_bytes > 0.0 && copy.sha256.len() == 64);
        // Again: replaces the older one.
        snapshot(&pool, &base, "full-copy.db").await.expect("again");
        assert!(snapshot(&pool, &base, "../inmaa.db").await.is_err());
        // Inside a transaction SQLite refuses it, and says so.
        sqlx::query("BEGIN").execute(&pool).await.unwrap();
        assert!(snapshot(&pool, &base, "in-tx.db").await.is_err());
        sqlx::query("ROLLBACK").execute(&pool).await.unwrap();
        pool.close().await;

        crate::backup::check_restore_source(&base.join("sync-tmp/full-copy.db"))
            .await
            .expect("a copy the program takes");
        assert_eq!(
            scalar(&base.join("sync-tmp/full-copy.db"), r#"SELECT "id" FROM "Zone""#).await,
            "zone-a"
        );
    });
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn a_full_copy_of_another_database_replaces_this_one_and_the_old_one_is_kept() {
    let base = temp_dir("install");
    let other = temp_dir("install-other");
    tauri::async_runtime::block_on(async {
        // The director's laptop makes its copy.
        let director = program_database(&other.join(crate::db::DB_FILE), "db-director", "zone-director").await;
        snapshot(&director, &other, "full-copy.db").await.expect("snapshot");
        director.close().await;
        std::fs::create_dir_all(base.join(TMP)).unwrap();
        std::fs::copy(other.join("sync-tmp/full-copy.db"), base.join("sync-tmp/full-copy.db")).unwrap();

        // The assistant's fresh laptop, another database id: installed all the same.
        let live = base.join(crate::db::DB_FILE);
        let pool = program_database(&live, "db-fresh", "zone-fresh").await;
        let at = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_793_000_000);
        let kept = install_copy(
            &pool,
            &base,
            "sync-tmp/full-copy.db",
            Some(r#"{"joined":true}"#.to_string()),
            at,
        )
        .await
        .expect("installed");
        assert!(pool.is_closed(), "the connection is closed: the window relaunches");

        assert_eq!(kept, base.join("protected/inmaa-pre-join-20261026T073320.db"));
        assert_eq!(
            scalar(&kept, r#"SELECT "id" FROM "Zone""#).await,
            "zone-fresh",
            "what it replaced is kept whole"
        );
        assert_eq!(
            scalar(&live, r#"SELECT "id" FROM "Zone""#).await,
            "zone-director",
            "the copy is in place"
        );
        assert_eq!(
            std::fs::read_to_string(base.join(INSTALL_NOTE)).unwrap(),
            r#"{"joined":true}"#,
            "the note, verbatim"
        );
        assert!(!base.join("sync-tmp/full-copy.db").exists() && !base.join("inmaa.db.joining").exists());
    });

    // Not a database of this program: refused, nothing replaced.
    tauri::async_runtime::block_on(async {
        let live = base.join(crate::db::DB_FILE);
        std::fs::write(base.join("sync-tmp/junk.db"), "not a database").unwrap();
        let pool = crate::db::open(&live).await.expect("open");
        assert!(
            install_copy(&pool, &base, "sync-tmp/junk.db", None, std::time::SystemTime::now())
                .await
                .is_err()
        );
        assert!(!pool.is_closed());
        assert!(
            install_copy(&pool, &base, "uploads/x.db", None, std::time::SystemTime::now())
                .await
                .is_err()
        );
        pool.close().await;
        assert_eq!(scalar(&live, r#"SELECT "id" FROM "Zone""#).await, "zone-director");
    });
    let _ = std::fs::remove_dir_all(&base);
    let _ = std::fs::remove_dir_all(&other);
}
