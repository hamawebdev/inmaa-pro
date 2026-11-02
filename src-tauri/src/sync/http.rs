//! The program's one way out to the network: requests to the sync mailbox.
//!
//! docs/sync/DECISION.md section 9 lifts the offline rule for this and nothing
//! else. What reaches the network from here is narrowed four times over:
//!
//! - **one address**, the origin the director typed (`sync_set_origin`), read
//!   from the vault on every request; HTTPS only, no path, no credentials;
//! - **one path prefix**, `/v1/`, with no dot segments and no fragment;
//! - **four methods** and **a short list of request headers**;
//! - **no redirect followed** and **no proxy**: an answer pointing elsewhere is
//!   refused, and a proxy named in the environment is not used.
//!
//! **Finding the mailbox** (docs/phone/DECISION.md section 10). On some
//! Algerian lines the addresses ordinary DNS gives for the mailbox are filtered
//! (the connection is reset after the TLS hello, or times out), while the ones
//! Cloudflare's own resolver gives answer. So the connection is made by
//! [`dial`], in this order: the address that worked last time (kept in a small
//! file beside the vault, [`AddressMemory`]); else the system resolver's, each
//! with a short limit; and when none of them gives a TLS session, the
//! mailbox's IPv4 addresses asked of DNS-over-HTTPS at [`RESOLVERS`]
//! (`1.1.1.1`, then `1.0.0.1`). Whatever the address, the TLS session is opened
//! with the mailbox's own name (SNI and Host) and its certificate is checked
//! for that name exactly as before: a wrong address can only fail. The address
//! whose certificate checked out is remembered; one that fails is forgotten.
//! The fallback is for the mailbox's host only: an address typed as a number,
//! or any other host, is connected to as the system gives it.
//!
//! The window itself still connects nowhere: its content security policy is
//! unchanged, and this module is reached only through the `sync_request`
//! command. This is the only file of the program that names the HTTP client,
//! and the only one that holds the resolvers' two addresses;
//! `src/lib/offline.test.ts` checks both.

use std::net::{IpAddr, Ipv4Addr, SocketAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use ureq::http;
use ureq::unversioned::resolver::{ResolvedSocketAddrs, Resolver};
use ureq::unversioned::transport::{
    ConnectionDetails, Connector, NextTimeout, RustlsConnector, TcpConnector, Transport,
};

/// How long each part of a request may take.
///
/// A page of envelopes or a part of the full copy is up to 16 MB on a mobile
/// line: the whole request may take minutes, as long as bytes keep coming.
/// What is short is the wait for silence: a read or a write that makes no
/// progress, an answer that does not start.
#[derive(Debug, Clone, Copy)]
pub(super) struct Limits {
    /// Finding the mailbox and opening its TLS session, every attempt of [`dial`] together.
    pub connect: Duration,
    /// From the request sent to the answer's head received.
    pub response: Duration,
    /// One read or one write that makes no progress.
    pub silence: Duration,
    /// The whole request, body included.
    pub global: Duration,
}

pub(super) const LIMITS: Limits = Limits {
    connect: Duration::from_secs(60),
    response: Duration::from_secs(30),
    silence: Duration::from_secs(30),
    global: Duration::from_secs(10 * 60),
};

/// The largest body sent: an envelope is cut below 1.5 MB, a file part is 1 MB.
pub(super) const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;

/// The largest answer read: a page of envelopes.
pub(super) const MAX_RESPONSE_BYTES: u64 = 16 * 1024 * 1024;

pub(super) const METHODS: [&str; 4] = ["GET", "POST", "PUT", "DELETE"];

/// Cloudflare's resolver, asked over HTTPS for the mailbox's addresses when the
/// system's do not answer (docs/phone/DECISION.md section 10). Its certificate
/// is issued to these two addresses and checked like any other.
pub(super) const RESOLVERS: [&str; 2] = ["1.1.1.1", "1.0.0.1"];

/// The address remembered: one attempt, then it is forgotten.
const REMEMBERED_ATTEMPT: Duration = Duration::from_secs(8);
/// The system resolver's answer.
const RESOLVE_LIMIT: Duration = Duration::from_secs(5);
/// One address the system gave: short, since a filtered one hangs.
const SYSTEM_ATTEMPT: Duration = Duration::from_secs(6);
/// How many of the system's addresses are tried before asking the resolver.
const SYSTEM_ADDRESSES: usize = 4;
/// One DNS-over-HTTPS question, connection included.
const RESOLVER_LIMIT: Duration = Duration::from_secs(8);
/// One address the resolver gave.
const FALLBACK_ATTEMPT: Duration = Duration::from_secs(10);
/// How many of the resolver's addresses are tried.
const FALLBACK_ADDRESSES: usize = 4;
/// The largest answer read from the resolver.
const MAX_RESOLVER_BYTES: u64 = 64 * 1024;

/// A request as the window asked for it, already checked by [`super::check_request`].
pub(super) struct Outgoing {
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

/// The mailbox's answer: every status but a redirect.
#[derive(Debug)]
pub(super) struct Answer {
    pub status: u16,
    /// Lower-case names; a repeated header's values joined with ", ".
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

/// Sends one request to `origin` (already normalised) and reads the answer.
///
/// Errors are `OFFLINE: …` when no HTTP answer came back (no network, DNS,
/// TLS, timeout, a cut) and `REFUSED: …` when the request or the answer is not
/// one the program may send or take. `https_only` is false only in this
/// module's tests, which talk to a plain local server.
pub(super) fn send(
    origin: &str,
    request: Outgoing,
    limits: &Limits,
    https_only: bool,
    memory: &AddressMemory,
) -> Result<Answer, String> {
    let url = format!("{origin}{}", request.path);

    let config = ureq::Agent::config_builder()
        .https_only(https_only)
        .max_redirects(0)
        .proxy(None)
        .http_status_as_error(false)
        .timeout_global(Some(limits.global))
        .timeout_connect(Some(limits.connect))
        .timeout_recv_response(Some(limits.response))
        .timeout_per_read(Some(limits.silence))
        .timeout_per_write(Some(limits.silence))
        .user_agent(concat!("inmaa-pro/", env!("CARGO_PKG_VERSION")))
        .build();
    let host = url_host(origin);
    let connector = MailboxConnector {
        mailbox_host: host,
        memory: memory.clone(),
        inner: ().chain(TcpConnector::default()).chain(RustlsConnector::default()),
    };
    let agent = ureq::Agent::with_parts(config, connector, DeferredResolver);

    let mut builder = http::Request::builder()
        .method(request.method.as_str())
        .uri(url.as_str());
    for (name, value) in &request.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }

    let outcome = if request.body.is_empty() && matches!(request.method.as_str(), "GET" | "DELETE") {
        let built = builder
            .body(ureq::SendBody::none())
            .map_err(|error| format!("REFUSED: {error}"))?;
        agent.run(built)
    } else {
        let built = builder
            .body(request.body)
            .map_err(|error| format!("REFUSED: {error}"))?;
        agent.run(built)
    };
    let mut response = outcome.map_err(describe)?;

    let status = response.status().as_u16();
    if (300..400).contains(&status) {
        return Err("REFUSED: the mailbox answered with a redirect".to_string());
    }

    let mut headers: Vec<(String, String)> = Vec::new();
    for (name, value) in response.headers() {
        let name = name.as_str().to_ascii_lowercase();
        let value = String::from_utf8_lossy(value.as_bytes()).to_string();
        match headers.iter_mut().find(|(known, _)| *known == name) {
            Some((_, joined)) => {
                joined.push_str(", ");
                joined.push_str(&value);
            }
            None => headers.push((name, value)),
        }
    }

    let body = response
        .body_mut()
        .with_config()
        .limit(MAX_RESPONSE_BYTES)
        .read_to_vec()
        .map_err(describe)?;

    Ok(Answer { status, headers, body })
}

fn describe(error: ureq::Error) -> String {
    match error {
        ureq::Error::RequireHttpsOnly(_) | ureq::Error::BadUri(_) | ureq::Error::Http(_) => {
            format!("REFUSED: {error}")
        }
        ureq::Error::BodyExceedsLimit(_) => "OFFLINE: the mailbox's answer was too large".to_string(),
        ureq::Error::Timeout(_) => "OFFLINE: the mailbox did not answer in time".to_string(),
        other => format!("OFFLINE: {other}"),
    }
}

/// The host of an origin as `http::Uri` gives it (lower case, no port), or "" when there is none.
fn url_host(origin: &str) -> String {
    origin
        .parse::<http::Uri>()
        .ok()
        .and_then(|uri| uri.host().map(str::to_string))
        .unwrap_or_default()
}

/// A host name the resolver may be asked about: letters, digits, hyphens and
/// dots, at least two labels, not a number. Anything else is not looked up
/// that way (and could not be put in the question's address safely).
pub(super) fn is_dns_name(host: &str) -> bool {
    let labels: Vec<&str> = host.split('.').collect();
    host.len() <= 253
        && labels.len() >= 2
        && labels.iter().all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
        && !labels.last().is_some_and(|tld| tld.bytes().all(|b| b.is_ascii_digit()))
}

/// An address on the public Internet: not this machine, not a private or
/// shared network, not a documentation, multicast or reserved block. A resolver
/// answer outside these is ignored.
pub(super) fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    !(ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_multicast()
        || ip.is_documentation()
        || a == 0
        || a >= 240
        || (a == 100 && (64..128).contains(&b))
        || (a == 198 && (b == 18 || b == 19)))
}

fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => {
            let first = v6.segments()[0];
            !(v6.is_unspecified() || v6.is_loopback() || v6.is_multicast())
                && (first & 0xfe00) != 0xfc00
                && (first & 0xffc0) != 0xfe80
                && v6.to_ipv4_mapped().is_none()
        }
    }
}

/// The IPv4 addresses a DNS-over-HTTPS answer (`application/dns-json`) gives
/// for `host`: the A records of `host` or of a name it is an alias of (CNAME),
/// public addresses only, in the answer's order, without repeats. An answer
/// that is not one, says the name does not exist, or holds no usable address
/// is an error.
pub(super) fn resolver_addresses(json: &[u8], host: &str) -> Result<Vec<Ipv4Addr>, String> {
    let answer: serde_json::Value = serde_json::from_slice(json).map_err(|_| "the resolver's answer is not JSON")?;
    if answer.get("Status").and_then(serde_json::Value::as_u64) != Some(0) {
        return Err(format!(
            "the resolver did not find {host} (status {})",
            answer.get("Status").map_or("none".to_string(), ToString::to_string)
        ));
    }
    let records: Vec<(String, u64, String)> = answer
        .get("Answer")
        .and_then(serde_json::Value::as_array)
        .map(|records| {
            records
                .iter()
                .filter_map(|record| {
                    let name = record.get("name")?.as_str()?.trim_end_matches('.').to_ascii_lowercase();
                    let kind = record.get("type")?.as_u64()?;
                    let data = record.get("data")?.as_str()?.trim().trim_end_matches('.').to_ascii_lowercase();
                    Some((name, kind, data))
                })
                .collect()
        })
        .unwrap_or_default();

    // The names that stand for the host: itself, then every alias it leads to.
    let mut names = vec![host.to_ascii_lowercase()];
    loop {
        let before = names.len();
        for (name, kind, data) in &records {
            if *kind == 5 && names.contains(name) && !names.contains(data) {
                names.push(data.clone());
            }
        }
        if names.len() == before || names.len() > 8 {
            break;
        }
    }

    let mut found: Vec<Ipv4Addr> = Vec::new();
    for (name, kind, data) in &records {
        if *kind != 1 || !names.contains(name) {
            continue;
        }
        if let Ok(ip) = data.parse::<Ipv4Addr>() {
            if is_public_v4(ip) && !found.contains(&ip) {
                found.push(ip);
            }
        }
    }
    if found.is_empty() {
        return Err(format!("the resolver gave no usable address for {host}"));
    }
    Ok(found)
}

// ── The address that worked ────────────────────────────────────────────────

/// The mailbox address that last gave a TLS session with the mailbox's own
/// certificate, kept for the next request. In a small file beside the vault
/// (the program's configuration folder, outside the database: never in a
/// backup, never sent to the other devices), or in memory for the tests.
#[derive(Debug, Clone, Default)]
pub(super) struct AddressMemory {
    file: Option<PathBuf>,
    held: Arc<Mutex<Option<(String, SocketAddr)>>>,
}

impl AddressMemory {
    /// Kept in `file`.
    pub(super) fn in_file(file: PathBuf) -> Self {
        Self {
            file: Some(file),
            held: Arc::default(),
        }
    }

    /// Kept for as long as this value lives (tests).
    #[cfg(test)]
    pub(super) fn in_memory() -> Self {
        Self::default()
    }

    fn read(&self) -> Option<(String, SocketAddr)> {
        match &self.file {
            None => self.held.lock().ok()?.clone(),
            Some(file) => {
                let text = std::fs::read_to_string(file).ok()?;
                let value: serde_json::Value = serde_json::from_str(&text).ok()?;
                let host = value.get("host")?.as_str()?.to_string();
                let address = value.get("address")?.as_str()?.parse::<SocketAddr>().ok()?;
                Some((host, address))
            }
        }
    }

    /// The address remembered for `host` on `port`, when it is a public one.
    pub(super) fn recall(&self, host: &str, port: u16) -> Option<SocketAddr> {
        let (known, address) = self.read()?;
        (known == host && address.port() == port && is_public(address.ip())).then_some(address)
    }

    /// Remembers `address` for `host` (written only when it changes).
    pub(super) fn remember(&self, host: &str, address: SocketAddr) {
        if self.read().as_ref() == Some(&(host.to_string(), address)) {
            return;
        }
        match &self.file {
            None => {
                if let Ok(mut held) = self.held.lock() {
                    *held = Some((host.to_string(), address));
                }
            }
            Some(file) => {
                let text = serde_json::json!({ "host": host, "address": address.to_string() }).to_string();
                let _ = write_whole(file, text.as_bytes());
            }
        }
    }

    /// Forgets what is remembered for `host`.
    pub(super) fn forget(&self, host: &str) {
        if self.read().is_none_or(|(known, _)| known != host) {
            return;
        }
        match &self.file {
            None => {
                if let Ok(mut held) = self.held.lock() {
                    *held = None;
                }
            }
            Some(file) => {
                let _ = std::fs::remove_file(file);
            }
        }
    }
}

/// A small file written whole or not at all: a new file, flushed, renamed over
/// the old one. Readable by this user only.
fn write_whole(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let dir = target.parent().ok_or_else(|| std::io::Error::other("no folder"))?;
    std::fs::create_dir_all(dir)?;
    let partial = target.with_extension("partial");
    let _ = std::fs::remove_file(&partial);
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let written = (|| {
        let mut out = options.open(&partial)?;
        out.write_all(bytes)?;
        out.sync_all()?;
        drop(out);
        std::fs::rename(&partial, target)
    })();
    if written.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    written
}

// ── Finding the mailbox ─────────────────────────────────────────────────────

/// What [`dial`] needs from the network; the real one is [`MailboxConnector`]'s,
/// the tests' a script.
pub(super) trait Dialer {
    type Conn;
    /// The system resolver's addresses for `host`.
    fn system(&self, host: &str, port: u16, limit: Duration) -> Result<Vec<SocketAddr>, String>;
    /// The IPv4 addresses of `host`, asked of the DNS-over-HTTPS resolver at `resolver`.
    fn ask(&self, resolver: Ipv4Addr, host: &str, limit: Duration) -> Result<Vec<Ipv4Addr>, String>;
    /// A TCP connection to `address`, and over it a TLS session with `host`'s
    /// certificate checked (plain TCP for an `http://` origin, in tests).
    fn open(&self, address: SocketAddr, limit: Duration) -> Result<Self::Conn, String>;
}

/// Opens a connection to the mailbox at `host`, in the order the module's
/// heading gives; `memory` is `None` for a host the fallback is not for.
pub(super) fn dial<D: Dialer>(
    dialer: &D,
    host: &str,
    port: u16,
    memory: Option<&AddressMemory>,
    budget: Duration,
) -> Result<D::Conn, String> {
    let deadline = Instant::now() + budget;
    let left = || deadline.saturating_duration_since(Instant::now());
    let mut tried: Vec<SocketAddr> = Vec::new();
    let mut last = String::from("no address to try");

    // An address written as a number: that one, as given.
    if let Ok(ip) = host.trim_start_matches('[').trim_end_matches(']').parse::<IpAddr>() {
        return dialer
            .open(SocketAddr::new(ip, port), left())
            .map_err(|error| format!("{host}: {error}"));
    }
    let memory = memory.filter(|_| is_dns_name(host));

    let attempt = |address: SocketAddr, limit: Duration, tried: &mut Vec<SocketAddr>, last: &mut String| {
        tried.push(address);
        let limit = limit.min(left());
        if limit.is_zero() {
            *last = "no time left".to_string();
            return None;
        }
        match dialer.open(address, limit) {
            Ok(conn) => {
                if let Some(memory) = memory {
                    memory.remember(host, address);
                }
                Some(conn)
            }
            Err(error) => {
                *last = format!("{address}: {error}");
                None
            }
        }
    };

    // 1. The address that worked last time.
    if let Some(memory) = memory {
        if let Some(address) = memory.recall(host, port) {
            if let Some(conn) = attempt(address, REMEMBERED_ATTEMPT, &mut tried, &mut last) {
                return Ok(conn);
            }
            memory.forget(host);
        }
    }

    // 2. The system resolver's.
    let per_address = if memory.is_some() { SYSTEM_ATTEMPT } else { budget };
    match dialer.system(host, port, RESOLVE_LIMIT.min(left())) {
        Ok(addresses) => {
            let fresh: Vec<SocketAddr> = addresses
                .into_iter()
                .filter(|address| !tried.contains(address))
                .take(SYSTEM_ADDRESSES)
                .collect();
            for address in fresh {
                if let Some(conn) = attempt(address, per_address, &mut tried, &mut last) {
                    return Ok(conn);
                }
            }
        }
        Err(error) => last = format!("{host}: {error}"),
    }
    if memory.is_none() {
        return Err(last);
    }

    // 3. Cloudflare's resolver, the second only when the first gives nothing.
    for resolver in RESOLVERS.iter().filter_map(|text| text.parse::<Ipv4Addr>().ok()) {
        let limit = RESOLVER_LIMIT.min(left());
        if limit.is_zero() {
            break;
        }
        match dialer.ask(resolver, host, limit) {
            Ok(addresses) => {
                let fresh: Vec<SocketAddr> = addresses
                    .into_iter()
                    .map(|ip| SocketAddr::new(IpAddr::V4(ip), port))
                    .filter(|address| !tried.contains(address))
                    .take(FALLBACK_ADDRESSES)
                    .collect();
                for address in fresh {
                    if let Some(conn) = attempt(address, FALLBACK_ATTEMPT, &mut tried, &mut last) {
                        return Ok(conn);
                    }
                }
                break;
            }
            Err(error) => last = format!("the resolver at {resolver}: {error}"),
        }
    }
    Err(last)
}

/// ureq asks its resolver before its connector; here the connector finds the
/// address itself ([`dial`]), so this one only answers a placeholder with the
/// right port, which the connector never connects to.
#[derive(Debug)]
struct DeferredResolver;

impl Resolver for DeferredResolver {
    fn resolve(
        &self,
        uri: &http::Uri,
        _config: &ureq::config::Config,
        _timeout: NextTimeout,
    ) -> Result<ResolvedSocketAddrs, ureq::Error> {
        let port = uri
            .port_u16()
            .unwrap_or(if uri.scheme_str() == Some("http") { 80 } else { 443 });
        let mut addresses = self.empty();
        addresses.push(SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), port));
        Ok(addresses)
    }
}

/// The connector of the mailbox's agent: [`dial`] over ureq's own TCP and
/// rustls connectors, with the request's URI (so the mailbox's name and
/// certificate) whatever the address.
#[derive(Debug)]
struct MailboxConnector<C> {
    mailbox_host: String,
    memory: AddressMemory,
    inner: C,
}

impl<C> Connector<()> for MailboxConnector<C>
where
    C: Connector<()>,
{
    type Out = Box<dyn Transport>;

    fn connect(&self, details: &ConnectionDetails, _chained: Option<()>) -> Result<Option<Self::Out>, ureq::Error> {
        let host = details.uri.host().unwrap_or_default().to_ascii_lowercase();
        let port = details
            .uri
            .port_u16()
            .unwrap_or(if details.needs_tls() { 443 } else { 80 });
        let budget = (*details.timeout.after).min(LIMITS.connect);
        let memory = (host == self.mailbox_host).then_some(&self.memory);
        let dialer = RealDialer {
            details,
            inner: &self.inner,
        };
        dial(&dialer, &host, port, memory, budget)
            .map(Some)
            .map_err(|message| ureq::Error::Io(std::io::Error::new(std::io::ErrorKind::ConnectionRefused, message)))
    }
}

struct RealDialer<'a, C> {
    details: &'a ConnectionDetails<'a>,
    inner: &'a C,
}

impl<C: Connector<()>> Dialer for RealDialer<'_, C> {
    type Conn = Box<dyn Transport>;

    fn system(&self, host: &str, port: u16, limit: Duration) -> Result<Vec<SocketAddr>, String> {
        let (tx, rx) = mpsc::sync_channel(1);
        let target = (host.to_string(), port);
        std::thread::spawn(move || {
            let _ = tx.send(target.to_socket_addrs().map(Iterator::collect::<Vec<_>>));
        });
        match rx.recv_timeout(limit) {
            Ok(Ok(addresses)) if !addresses.is_empty() => Ok(addresses),
            Ok(Ok(_)) => Err("the system resolver gave no address".to_string()),
            Ok(Err(error)) => Err(format!("the system resolver: {error}")),
            Err(_) => Err("the system resolver did not answer in time".to_string()),
        }
    }

    fn ask(&self, resolver: Ipv4Addr, host: &str, limit: Duration) -> Result<Vec<Ipv4Addr>, String> {
        if !is_dns_name(host) {
            return Err(format!("{host} is not a name to ask about"));
        }
        let config = ureq::Agent::config_builder()
            .https_only(true)
            .max_redirects(0)
            .proxy(None)
            .http_status_as_error(false)
            .timeout_global(Some(limit))
            .user_agent(concat!("inmaa-pro/", env!("CARGO_PKG_VERSION")))
            .build();
        let agent: ureq::Agent = config.into();
        let url = format!("https://{resolver}/dns-query?name={host}&type=A");
        let mut response = agent
            .get(url.as_str())
            .header("accept", "application/dns-json")
            .call()
            .map_err(|error| error.to_string())?;
        if response.status().as_u16() != 200 {
            return Err(format!("status {}", response.status().as_u16()));
        }
        let kind = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !kind.starts_with("application/dns-json") && !kind.starts_with("application/json") {
            return Err(format!("an answer of type {kind}"));
        }
        let body = response
            .body_mut()
            .with_config()
            .limit(MAX_RESOLVER_BYTES)
            .read_to_vec()
            .map_err(|error| error.to_string())?;
        resolver_addresses(&body, host)
    }

    fn open(&self, address: SocketAddr, limit: Duration) -> Result<Self::Conn, String> {
        let details = self.details;
        let mut addrs = details.resolver.empty();
        addrs.push(address);
        let attempt = ConnectionDetails {
            uri: details.uri,
            addrs,
            config: details.config,
            request_level: details.request_level,
            resolver: details.resolver,
            now: (details.current_time)(),
            timeout: NextTimeout {
                after: limit.into(),
                reason: ureq::Timeout::Connect,
                ..details.timeout
            },
            current_time: details.current_time.clone(),
            run_connector: details.run_connector.clone(),
            register_shutdown: details.register_shutdown.clone(),
        };
        match self.inner.connect(&attempt, None) {
            Ok(Some(transport)) => Ok(Box::new(transport)),
            Ok(None) => Err("no connection was made".to_string()),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[cfg(test)]
mod tests;
