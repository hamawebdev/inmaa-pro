use super::*;
use std::cell::RefCell;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;

/// Short limits for the local tests: everything within `seconds`.
fn limits(seconds: u64) -> Limits {
    let all = Duration::from_secs(seconds);
    Limits {
        connect: all,
        response: all,
        silence: all,
        global: all,
    }
}

// ── Sending, against a plain local server ───────────────────────────────────

/// What the test server received.
struct Received {
    head: String,
    body: Vec<u8>,
}

/// A plain HTTP server on a free local port that answers one request with
/// `answer` (written as is) and reports what it received. Started and
/// stopped inside each test: the thread ends after its one answer.
fn serve_once(answer: Vec<u8>) -> (String, mpsc::Receiver<Received>, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a free local port");
    let origin = format!("http://{}", listener.local_addr().expect("address"));
    let (tx, rx) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let (stream, _) = listener.accept().expect("one connection");
        stream.set_read_timeout(Some(Duration::from_secs(5))).expect("timeout");
        let mut reader = BufReader::new(stream.try_clone().expect("clone"));
        let mut head = String::new();
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                break;
            }
            head.push_str(&line);
        }
        let length = head
            .lines()
            .find_map(|line| {
                line.to_ascii_lowercase()
                    .strip_prefix("content-length:")
                    .map(|v| v.trim().parse::<usize>().unwrap_or(0))
            })
            .unwrap_or(0);
        let mut body = vec![0u8; length];
        reader.read_exact(&mut body).expect("the body");
        let mut stream = stream;
        stream.write_all(&answer).expect("answer");
        let _ = stream.flush();
        let _ = tx.send(Received { head, body });
    });
    (origin, rx, handle)
}

fn request(method: &str, path: &str, headers: &[(&str, &str)], body: &[u8]) -> Outgoing {
    Outgoing {
        method: method.to_string(),
        path: path.to_string(),
        headers: headers.iter().map(|(n, v)| (n.to_string(), v.to_string())).collect(),
        body: body.to_vec(),
    }
}

fn local_send(origin: &str, outgoing: Outgoing, seconds: u64) -> Result<Answer, String> {
    send(origin, outgoing, &limits(seconds), false, &AddressMemory::in_memory())
}

#[test]
fn a_request_goes_out_with_its_headers_and_body_and_any_status_comes_back() {
    let (origin, rx, server) = serve_once(
        b"HTTP/1.1 409 Conflict\r\nContent-Length: 5\r\nX-Relay-Time: 1793000000000\r\nConnection: close\r\n\r\nbytes"
            .to_vec(),
    );
    let answer = local_send(
        &origin,
        request(
            "PUT",
            "/v1/centres/c1/envelopes/12?kind=tx",
            &[
                ("authorization", "Bearer t"),
                ("content-type", "application/octet-stream"),
            ],
            &[0, 1, 2, 255],
        ),
        5,
    )
    .expect("an answer");
    server.join().expect("server");
    let received = rx.recv().expect("the server saw the request");

    assert!(
        received
            .head
            .starts_with("PUT /v1/centres/c1/envelopes/12?kind=tx HTTP/1.1\r\n"),
        "{}",
        received.head
    );
    assert!(received.head.to_ascii_lowercase().contains("authorization: bearer t"));
    assert_eq!(received.body, vec![0, 1, 2, 255]);

    assert_eq!(answer.status, 409);
    assert_eq!(answer.body, b"bytes");
    assert!(answer
        .headers
        .iter()
        .any(|(n, v)| n == "x-relay-time" && v == "1793000000000"));
}

#[test]
fn a_redirect_is_refused_and_not_followed() {
    let (origin, rx, server) = serve_once(
        b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/elsewhere\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            .to_vec(),
    );
    let refused = local_send(&origin, request("GET", "/v1/time", &[], &[]), 5).expect_err("a redirect");
    server.join().expect("server");
    assert!(rx.recv().is_ok());
    assert_eq!(refused, "REFUSED: the mailbox answered with a redirect");
}

#[test]
fn plain_http_is_refused_before_anything_is_sent() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("port");
    listener.set_nonblocking(true).expect("nonblocking");
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let refused = send(
        &origin,
        request("GET", "/v1/time", &[], &[]),
        &limits(5),
        true,
        &AddressMemory::in_memory(),
    )
    .expect_err("http");
    assert!(refused.starts_with("REFUSED:"), "{refused}");
    // Nobody connected.
    assert!(listener.accept().is_err());
}

#[test]
fn no_answer_is_offline() {
    // A port that was free a moment ago: nothing listens there.
    let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let offline = local_send(
        &format!("http://127.0.0.1:{port}"),
        request("GET", "/v1/time", &[], &[]),
        5,
    )
    .expect_err("nothing listens");
    assert!(offline.starts_with("OFFLINE:"), "{offline}");
}

#[test]
fn a_mailbox_that_does_not_answer_in_time_is_offline() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("port");
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        // Accepts and says nothing until the client gives up.
        let (stream, _) = listener.accept().expect("connection");
        std::thread::sleep(Duration::from_secs(3));
        drop(stream);
    });
    let started = Instant::now();
    let offline = local_send(&origin, request("GET", "/v1/time", &[], &[]), 1).expect_err("timeout");
    assert!(offline.starts_with("OFFLINE:"), "{offline}");
    assert!(started.elapsed() < Duration::from_secs(3));
    server.join().expect("server");
}

#[test]
fn a_slow_but_steady_answer_is_read_to_its_end() {
    // 3 s of body, a byte every 100 ms: longer than the limit on silence (1 s),
    // which a transfer that keeps coming must not hit.
    let listener = TcpListener::bind("127.0.0.1:0").expect("port");
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("connection");
        let mut buffer = [0u8; 1024];
        let _ = stream.read(&mut buffer);
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 30\r\nConnection: close\r\n\r\n")
            .unwrap();
        for _ in 0..30 {
            std::thread::sleep(Duration::from_millis(100));
            stream.write_all(b"x").unwrap();
            stream.flush().unwrap();
        }
    });
    let slow = Limits {
        connect: Duration::from_secs(5),
        response: Duration::from_secs(5),
        silence: Duration::from_secs(1),
        global: Duration::from_secs(20),
    };
    let answer = send(
        &origin,
        request("GET", "/v1/time", &[], &[]),
        &slow,
        false,
        &AddressMemory::in_memory(),
    )
    .expect("the whole body");
    assert_eq!(answer.body.len(), 30);
    server.join().expect("server");
}

#[test]
fn the_program_s_limits_let_a_large_page_arrive_on_a_slow_line() {
    // 16 MB at 1 Mbit/s is about two minutes: the whole request may take more,
    // a silence may not.
    assert!(LIMITS.global >= Duration::from_secs(5 * 60));
    assert!(LIMITS.silence <= Duration::from_secs(30));
    assert!(LIMITS.connect <= Duration::from_secs(60));
}

// ── The resolver's answer ───────────────────────────────────────────────────

const HOST: &str = "inmaa-relay.example.workers.dev";

#[test]
fn the_resolver_s_answer_gives_the_host_s_public_ipv4_addresses() {
    let json = br#"{"Status":0,"TC":false,"RD":true,"RA":true,"AD":false,"CD":false,
        "Question":[{"name":"inmaa-relay.example.workers.dev","type":1}],
        "Answer":[
          {"name":"inmaa-relay.example.workers.dev","type":1,"TTL":300,"data":"104.21.39.37"},
          {"name":"inmaa-relay.example.workers.dev","type":1,"TTL":300,"data":"172.67.142.233"},
          {"name":"inmaa-relay.example.workers.dev","type":1,"TTL":300,"data":"104.21.39.37"}
        ]}"#;
    assert_eq!(
        resolver_addresses(json, HOST).unwrap(),
        vec![Ipv4Addr::new(104, 21, 39, 37), Ipv4Addr::new(172, 67, 142, 233)]
    );
    // The name is compared without case and without the final dot.
    let dotted = br#"{"Status":0,"Answer":[{"name":"INMAA-relay.example.workers.dev.","type":1,"data":"104.21.39.37"}]}"#;
    assert_eq!(resolver_addresses(dotted, HOST).unwrap(), vec![Ipv4Addr::new(104, 21, 39, 37)]);
}

#[test]
fn the_resolver_s_answer_follows_an_alias() {
    let json = br#"{"Status":0,"Answer":[
        {"name":"inmaa-relay.example.workers.dev.","type":5,"data":"edge.example.net."},
        {"name":"edge.example.net.","type":1,"data":"104.21.39.37"},
        {"name":"unrelated.example.org.","type":1,"data":"172.67.1.1"}
      ]}"#;
    assert_eq!(resolver_addresses(json, HOST).unwrap(), vec![Ipv4Addr::new(104, 21, 39, 37)]);
}

#[test]
fn the_resolver_s_answer_is_refused_when_it_is_not_usable() {
    // Not JSON, the name not found, no answer at all.
    assert!(resolver_addresses(b"<html>", HOST).is_err());
    assert!(resolver_addresses(br#"{"Status":3,"Answer":[]}"#, HOST).is_err());
    assert!(resolver_addresses(br#"{"Status":0}"#, HOST).is_err());
    // Records for another name, of another type, or not an address.
    assert!(resolver_addresses(
        br#"{"Status":0,"Answer":[
            {"name":"other.example.org","type":1,"data":"104.21.39.37"},
            {"name":"inmaa-relay.example.workers.dev","type":28,"data":"2606:4700::6815:2725"},
            {"name":"inmaa-relay.example.workers.dev","type":1,"data":"not an address"}
        ]}"#,
        HOST
    )
    .is_err());
    // An address of this machine, of a private or shared network, of a reserved block: ignored.
    for private in [
        "127.0.0.1",
        "10.0.0.5",
        "192.168.1.1",
        "172.16.0.1",
        "169.254.1.1",
        "100.64.0.1",
        "0.0.0.0",
        "255.255.255.255",
        "224.0.0.1",
        "192.0.2.1",
        "198.18.0.1",
        "240.0.0.1",
    ] {
        let json = format!(r#"{{"Status":0,"Answer":[{{"name":"{HOST}","type":1,"data":"{private}"}}]}}"#);
        assert!(resolver_addresses(json.as_bytes(), HOST).is_err(), "{private}");
    }
}

#[test]
fn only_a_plain_host_name_is_asked_about() {
    assert!(is_dns_name("inmaa-relay.ayoubwass404.workers.dev"));
    assert!(is_dns_name("relay.example.dz"));
    for refused in [
        "",
        "localhost",
        "104.21.39.37",
        "a..b",
        "-a.example.com",
        "a-.example.com",
        "a.example.com&type=AAAA",
        "a.example.com/x",
        "A.example.com",
        "exa mple.com",
    ] {
        assert!(!is_dns_name(refused), "{refused}");
    }
}

// ── The order of attempts, with a scripted network ──────────────────────────

/// A network written in advance: which addresses the system resolver and the
/// two resolvers give, which addresses answer. Records every step.
#[derive(Default)]
struct Script {
    system: Option<Vec<&'static str>>,
    resolvers: Vec<(&'static str, Vec<&'static str>)>,
    answering: Vec<&'static str>,
    steps: RefCell<Vec<String>>,
}

impl Dialer for Script {
    type Conn = SocketAddr;

    fn system(&self, host: &str, port: u16, _limit: Duration) -> Result<Vec<SocketAddr>, String> {
        self.steps.borrow_mut().push(format!("system {host}"));
        match &self.system {
            Some(addresses) => Ok(addresses
                .iter()
                .map(|ip| SocketAddr::new(ip.parse().unwrap(), port))
                .collect()),
            None => Err("no such host".to_string()),
        }
    }

    fn ask(&self, resolver: Ipv4Addr, host: &str, limit: Duration) -> Result<Vec<Ipv4Addr>, String> {
        assert!(limit <= RESOLVER_LIMIT);
        self.steps.borrow_mut().push(format!("ask {resolver} {host}"));
        self.resolvers
            .iter()
            .find(|(at, _)| at.parse::<Ipv4Addr>().unwrap() == resolver)
            .map(|(_, addresses)| addresses.iter().map(|ip| ip.parse().unwrap()).collect())
            .ok_or_else(|| "reset".to_string())
    }

    fn open(&self, address: SocketAddr, _limit: Duration) -> Result<SocketAddr, String> {
        self.steps.borrow_mut().push(format!("open {address}"));
        if self.answering.contains(&address.ip().to_string().as_str()) {
            Ok(address)
        } else {
            Err("connection reset".to_string())
        }
    }
}

const FILTERED_A: &str = "188.114.96.3";
const FILTERED_B: &str = "188.114.97.3";
const GOOD_A: &str = "104.21.39.37";
const GOOD_B: &str = "172.67.142.233";

fn steps(script: &Script) -> Vec<String> {
    script.steps.borrow().clone()
}

fn at(ip: &str) -> SocketAddr {
    SocketAddr::new(ip.parse().unwrap(), 443)
}

#[test]
fn filtered_system_addresses_lead_to_the_resolver_s_and_the_one_that_answers_is_remembered() {
    let script = Script {
        system: Some(vec![FILTERED_A, FILTERED_B, "2a06:98c1:3120::3"]),
        resolvers: vec![("1.1.1.1", vec![GOOD_A, GOOD_B])],
        answering: vec![GOOD_B],
        ..Script::default()
    };
    let memory = AddressMemory::in_memory();
    let reached = dial(&script, HOST, 443, Some(&memory), Duration::from_secs(60)).unwrap();
    assert_eq!(reached, at(GOOD_B));
    assert_eq!(
        steps(&script),
        vec![
            format!("system {HOST}"),
            format!("open {FILTERED_A}:443"),
            format!("open {FILTERED_B}:443"),
            "open [2a06:98c1:3120::3]:443".to_string(),
            format!("ask 1.1.1.1 {HOST}"),
            format!("open {GOOD_A}:443"),
            format!("open {GOOD_B}:443"),
        ]
    );
    assert_eq!(memory.recall(HOST, 443), Some(at(GOOD_B)));

    // The next request goes straight to it.
    let again = Script {
        system: Some(vec![FILTERED_A]),
        resolvers: vec![("1.1.1.1", vec![GOOD_A])],
        answering: vec![GOOD_B],
        ..Script::default()
    };
    assert_eq!(
        dial(&again, HOST, 443, Some(&memory), Duration::from_secs(60)).unwrap(),
        at(GOOD_B)
    );
    assert_eq!(steps(&again), vec![format!("open {GOOD_B}:443")]);
}

#[test]
fn the_second_resolver_is_asked_only_when_the_first_gives_nothing() {
    let script = Script {
        system: Some(vec![FILTERED_A]),
        resolvers: vec![("1.0.0.1", vec![GOOD_A])],
        answering: vec![GOOD_A],
        ..Script::default()
    };
    let memory = AddressMemory::in_memory();
    assert_eq!(
        dial(&script, HOST, 443, Some(&memory), Duration::from_secs(60)).unwrap(),
        at(GOOD_A)
    );
    assert_eq!(
        steps(&script),
        vec![
            format!("system {HOST}"),
            format!("open {FILTERED_A}:443"),
            format!("ask 1.1.1.1 {HOST}"),
            format!("ask 1.0.0.1 {HOST}"),
            format!("open {GOOD_A}:443"),
        ]
    );

    // When the first answers but none of its addresses does, the second is not asked.
    let first_answers = Script {
        system: Some(vec![FILTERED_A]),
        resolvers: vec![("1.1.1.1", vec![GOOD_A]), ("1.0.0.1", vec![GOOD_B])],
        answering: vec![GOOD_B],
        ..Script::default()
    };
    assert!(dial(&first_answers, HOST, 443, Some(&AddressMemory::in_memory()), Duration::from_secs(60)).is_err());
    assert!(!steps(&first_answers).iter().any(|step| step.starts_with("ask 1.0.0.1")));
}

#[test]
fn working_system_addresses_never_reach_the_resolver() {
    let script = Script {
        system: Some(vec![GOOD_A]),
        resolvers: vec![("1.1.1.1", vec![GOOD_B])],
        answering: vec![GOOD_A, GOOD_B],
        ..Script::default()
    };
    let memory = AddressMemory::in_memory();
    assert_eq!(
        dial(&script, HOST, 443, Some(&memory), Duration::from_secs(60)).unwrap(),
        at(GOOD_A)
    );
    assert_eq!(steps(&script), vec![format!("system {HOST}"), format!("open {GOOD_A}:443")]);
    assert_eq!(memory.recall(HOST, 443), Some(at(GOOD_A)));
}

#[test]
fn a_remembered_address_that_fails_is_forgotten_and_not_tried_twice() {
    let memory = AddressMemory::in_memory();
    memory.remember(HOST, at(GOOD_A));
    let script = Script {
        system: Some(vec![GOOD_A, FILTERED_A]),
        resolvers: vec![("1.1.1.1", vec![GOOD_A, GOOD_B])],
        answering: vec![GOOD_B],
        ..Script::default()
    };
    assert_eq!(
        dial(&script, HOST, 443, Some(&memory), Duration::from_secs(60)).unwrap(),
        at(GOOD_B)
    );
    assert_eq!(
        steps(&script),
        vec![
            format!("open {GOOD_A}:443"),
            format!("system {HOST}"),
            format!("open {FILTERED_A}:443"),
            format!("ask 1.1.1.1 {HOST}"),
            format!("open {GOOD_B}:443"),
        ]
    );
    assert_eq!(memory.recall(HOST, 443), Some(at(GOOD_B)));
}

#[test]
fn when_nothing_answers_nothing_is_remembered() {
    let memory = AddressMemory::in_memory();
    memory.remember(HOST, at(GOOD_A));
    let script = Script {
        system: None,
        resolvers: vec![],
        answering: vec![],
        ..Script::default()
    };
    let error = dial(&script, HOST, 443, Some(&memory), Duration::from_secs(60)).unwrap_err();
    assert!(error.contains("1.0.0.1"), "{error}");
    assert_eq!(memory.recall(HOST, 443), None);
    assert_eq!(
        steps(&script),
        vec![
            format!("open {GOOD_A}:443"),
            format!("system {HOST}"),
            format!("ask 1.1.1.1 {HOST}"),
            format!("ask 1.0.0.1 {HOST}"),
        ]
    );
}

#[test]
fn the_fallback_is_for_the_mailbox_s_name_only() {
    // Another host (no memory given): the system's addresses, and nothing else.
    let script = Script {
        system: Some(vec![FILTERED_A]),
        resolvers: vec![("1.1.1.1", vec![GOOD_A])],
        answering: vec![GOOD_A],
        ..Script::default()
    };
    assert!(dial(&script, HOST, 443, None, Duration::from_secs(60)).is_err());
    assert_eq!(steps(&script), vec![format!("system {HOST}"), format!("open {FILTERED_A}:443")]);

    // An address typed as a number: that one, as given, never remembered.
    let memory = AddressMemory::in_memory();
    let literal = Script {
        answering: vec![],
        ..Script::default()
    };
    assert!(dial(&literal, "203.0.113.9", 8443, Some(&memory), Duration::from_secs(60)).is_err());
    assert_eq!(steps(&literal), vec!["open 203.0.113.9:8443".to_string()]);

    // A name that is not a plain host name: no resolver.
    let odd = Script {
        system: Some(vec![FILTERED_A]),
        resolvers: vec![("1.1.1.1", vec![GOOD_A])],
        answering: vec![GOOD_A],
        ..Script::default()
    };
    assert!(dial(&odd, "localhost", 443, Some(&memory), Duration::from_secs(60)).is_err());
    assert!(!steps(&odd).iter().any(|step| step.starts_with("ask")));
    assert_eq!(memory.recall("localhost", 443), None);
}

#[test]
fn no_attempt_is_made_once_the_budget_is_spent() {
    let script = Script {
        system: Some(vec![FILTERED_A]),
        resolvers: vec![("1.1.1.1", vec![GOOD_A])],
        answering: vec![GOOD_A],
        ..Script::default()
    };
    assert!(dial(&script, HOST, 443, Some(&AddressMemory::in_memory()), Duration::ZERO).is_err());
    assert!(!steps(&script).iter().any(|step| step.starts_with("open") || step.starts_with("ask")));
}

// ── The remembered address, in its file ─────────────────────────────────────

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("inmaa-http-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn the_address_is_kept_in_its_file_for_its_host_only() {
    let dir = scratch("memory");
    let file = dir.join("sync-address.json");
    let memory = AddressMemory::in_file(file.clone());
    assert_eq!(memory.recall(HOST, 443), None);

    memory.remember(HOST, at(GOOD_A));
    // Another value reads the same file: it survives the program.
    let later = AddressMemory::in_file(file.clone());
    assert_eq!(later.recall(HOST, 443), Some(at(GOOD_A)));
    assert_eq!(later.recall("other.example.org", 443), None);
    assert_eq!(later.recall(HOST, 8443), None);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o600);
    }

    // Forgetting another host's leaves it; forgetting its own removes the file.
    later.forget("other.example.org");
    assert!(file.exists());
    later.forget(HOST);
    assert!(!file.exists());
    assert_eq!(memory.recall(HOST, 443), None);

    // A file that names a private address, or is not one, is not followed.
    std::fs::write(&file, format!(r#"{{"host":"{HOST}","address":"192.168.1.10:443"}}"#)).unwrap();
    assert_eq!(memory.recall(HOST, 443), None);
    std::fs::write(&file, "not json").unwrap();
    assert_eq!(memory.recall(HOST, 443), None);
    let _ = std::fs::remove_dir_all(&dir);
}

// ── On the real line ────────────────────────────────────────────────────────

/// The real mailbox, through the system resolver and, where its addresses are
/// filtered, Cloudflare's resolver (docs/phone/DECISION.md section 10). Not
/// run by default: it needs the network and costs the mailbox two requests.
///
/// `INMAA_RELAY_ORIGIN=https://inmaa-relay.<name>.workers.dev cargo test --lib --offline
///  reaches_the_real_mailbox -- --ignored --nocapture`
#[test]
#[ignore]
fn reaches_the_real_mailbox() {
    let origin = std::env::var("INMAA_RELAY_ORIGIN").expect("INMAA_RELAY_ORIGIN");
    let dir = scratch("live");
    let memory = AddressMemory::in_file(dir.join("sync-address.json"));
    let host = url_host(&origin);
    let time = || request("GET", "/v1/time", &[("x-inmaa-protocol", "2")], &[]);

    let system: Vec<SocketAddr> = (host.as_str(), 443).to_socket_addrs().map(Iterator::collect).unwrap_or_default();
    println!("system resolver: {system:?}");

    let started = Instant::now();
    let answer = send(&origin, time(), &LIMITS, true, &memory).expect("an answer");
    let remembered = memory.recall(&host, 443);
    println!(
        "first: {} in {} ms, through {remembered:?}: {}",
        answer.status,
        started.elapsed().as_millis(),
        String::from_utf8_lossy(&answer.body)
    );
    assert_eq!(answer.status, 200);
    assert!(remembered.is_some());

    let started = Instant::now();
    let answer = send(&origin, time(), &LIMITS, true, &memory).expect("an answer");
    println!("second: {} in {} ms", answer.status, started.elapsed().as_millis());
    assert_eq!(answer.status, 200);
    let _ = std::fs::remove_dir_all(&dir);
}
