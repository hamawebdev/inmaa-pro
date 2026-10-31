//! The program's one way out to the network: requests to the sync mailbox.
//!
//! docs/sync/DECISION.md section 9 lifts the offline rule for this and nothing
//! else. What reaches the network from here is narrowed four times over:
//!
//! - **one address**, the origin the director typed (`sync_set_origin`), read
//!   from the vault on every request; HTTPS only, no path, no credentials;
//! - **one path prefix**, `/v1/`, with no dot segments and no fragment;
//! - **four methods** and **a short list of request headers**;
//! - **no redirect followed**: an answer pointing elsewhere is refused, so the
//!   mailbox cannot send the program on to another host.
//!
//! The window itself still connects nowhere: its content security policy is
//! unchanged, and this module is reached only through the `sync_request`
//! command. This is the only file of the program that names the HTTP client;
//! `src/lib/offline.test.ts` checks that.

use std::time::Duration;

use ureq::http;

/// How long one request may take, connection, upload and answer together.
pub(super) const TIMEOUT: Duration = Duration::from_secs(30);

/// The largest body sent: an envelope is cut below 1.5 MB, a file part is 1 MB.
pub(super) const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;

/// The largest answer read: a page of envelopes.
pub(super) const MAX_RESPONSE_BYTES: u64 = 16 * 1024 * 1024;

pub(super) const METHODS: [&str; 4] = ["GET", "POST", "PUT", "DELETE"];

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
pub(super) fn send(origin: &str, request: Outgoing, timeout: Duration, https_only: bool) -> Result<Answer, String> {
    let url = format!("{origin}{}", request.path);

    let config = ureq::Agent::config_builder()
        .https_only(https_only)
        .max_redirects(0)
        .http_status_as_error(false)
        .timeout_global(Some(timeout))
        .user_agent(concat!("inmaa-pro/", env!("CARGO_PKG_VERSION")))
        .build();
    let agent: ureq::Agent = config.into();

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

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

    #[test]
    fn a_request_goes_out_with_its_headers_and_body_and_any_status_comes_back() {
        let (origin, rx, server) = serve_once(
            b"HTTP/1.1 409 Conflict\r\nContent-Length: 5\r\nX-Relay-Time: 1793000000000\r\nConnection: close\r\n\r\nbytes"
                .to_vec(),
        );
        let answer = send(
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
            Duration::from_secs(5),
            false,
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
            b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/elsewhere\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec(),
        );
        let refused = send(
            &origin,
            request("GET", "/v1/time", &[], &[]),
            Duration::from_secs(5),
            false,
        )
        .expect_err("a redirect");
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
            Duration::from_secs(5),
            true,
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
        let offline = send(
            &format!("http://127.0.0.1:{port}"),
            request("GET", "/v1/time", &[], &[]),
            Duration::from_secs(5),
            false,
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
        let offline = send(
            &origin,
            request("GET", "/v1/time", &[], &[]),
            Duration::from_secs(1),
            false,
        )
        .expect_err("timeout");
        assert!(offline.starts_with("OFFLINE:"), "{offline}");
        server.join().expect("server");
    }
}
