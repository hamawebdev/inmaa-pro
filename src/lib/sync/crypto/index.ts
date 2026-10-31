/**
 * The sync's crypto: Web Crypto only, the same code in the window and under Node (BUILD 2.3).
 *
 * - The key ring: `newKeyRing`, `rotateKeyRing`, `checkKeyRing` (what the vault and a ticket hold).
 * - Envelopes: `sealEnvelope` / `openEnvelope`; file parts: `sealPart` / `openPart`; file ids: `fileBlobId`.
 * - Pairing: `newPairingCode`, `formatPairingCode`, `parsePairingCode`, `ticketIdFor`, `sealForTicket`, `openTicket`.
 *
 * Errors: `SealBroken` (altered, wrong key, wrong header, wrong code), `UnknownKey`, `PairingCodeTypo`.
 */
export * from "./bytes";
export * from "./errors";
export { checkKeyRing, keyIdOf, newKeyRing, rotateKeyRing, type KeyPurpose, type KeyRing } from "./keys";
export * from "./pairing";
export * from "./seal";
