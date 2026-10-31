/**
 * The program's way to the mailbox: native's `sync_request` command, the only request that leaves the program
 * (DECISION section 9). The window never connects anywhere; the Rust side sends the request to the origin saved
 * in the vault, under /v1/ only.
 *
 * The bytes cross the IPC raw, never as JSON arrays: the request body is the invoke payload and the method, path
 * and headers ride in the invoke's headers; the answer is
 *
 *     [u32 BE: head length] [head: UTF-8 JSON {"status": n, "headers": {lower-case name: value}}] [body]
 *
 * Every HTTP answer comes back that way, refusals included. The command fails only when there was no answer to
 * give: its message starts "OFFLINE:" (network, timeout, a cut) or "REFUSED:" (no address set, a path, method or
 * header it does not allow, a redirect).
 */
import { invoke } from "@tauri-apps/api/core";

import { fromUtf8 } from "../crypto/bytes";
import { TransportFailure, type RelayRequest, type RelayResponse, type RelayTransport } from "./transport";

/** Reads native's framed answer. Exported for the tests. */
export function decodeNativeAnswer(buffer: ArrayBuffer | Uint8Array): RelayResponse {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < 4) throw new TransportFailure("offline", "relay: the answer is cut");
  const headLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (4 + headLength > bytes.byteLength) throw new TransportFailure("offline", "relay: the answer is cut");
  const head = JSON.parse(fromUtf8(bytes.subarray(4, 4 + headLength))) as {
    status: number;
    headers: Record<string, string>;
  };
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(head.headers ?? {})) headers[name.toLowerCase()] = value;
  return { status: head.status, headers, body: bytes.slice(4 + headLength) };
}

/** What the command's failure says, as the transport's failure. Exported for the tests. */
export function nativeFailure(error: unknown): TransportFailure {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : JSON.stringify(error);
  return message.startsWith("REFUSED:")
    ? new TransportFailure("refused", `relay: ${message}`)
    : new TransportFailure("offline", `relay: ${message}`);
}

export const tauriTransport: RelayTransport = {
  async send(request: RelayRequest): Promise<RelayResponse> {
    let answer: ArrayBuffer;
    try {
      answer = await invoke<ArrayBuffer>("sync_request", request.body ?? new Uint8Array(0), {
        headers: {
          "x-sync-method": request.method,
          "x-sync-path": request.path,
          "x-sync-headers": JSON.stringify(request.headers),
        },
      });
    } catch (error) {
      throw nativeFailure(error);
    }
    return decodeNativeAnswer(answer);
  },
};
