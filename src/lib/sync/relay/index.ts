/**
 * The mailbox client (BUILD 2.4): `createRelayClient(transport, credentials)`, the program's `tauriTransport`, and
 * the six typed failures. Tests use `createMemoryRelay()` (src/testing/sync/memory-relay.ts) as the transport.
 */
export * from "./client";
export * from "./errors";
export { decodeFrames, encodeFrames } from "./frames";
export { tauriTransport } from "./tauri-transport";
export * from "./transport";
