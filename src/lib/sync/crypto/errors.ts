/** What the sync's crypto refuses. Faults in the code are plain `Error`s with a "sync:" prefix. */
export class SyncCryptoError extends Error {}

/**
 * The sealed bytes do not open: they were altered, or sealed under another key, or the header given is not the one
 * they were sealed with (the mailbox swapped or edited an envelope's metadata), or the pairing code is not the one
 * the ticket was sealed with.
 */
export class SealBroken extends SyncCryptoError {
  constructor(what: string) {
    super(`sync: ${what} does not open (altered, wrong key or wrong header)`);
    this.name = "SealBroken";
  }
}

/** The key ring holds no key of that id: an envelope sealed under a key this laptop was never given. */
export class UnknownKey extends SyncCryptoError {
  constructor(readonly keyId: string) {
    super(`sync: no key ${keyId} in the key ring`);
    this.name = "UnknownKey";
  }
}

export type PairingCodeProblem = "length" | "character" | "check";

/**
 * The code typed is not a code this program could have shown: a wrong length, a character outside the alphabet, or
 * a check that does not match (a character mistyped, or two swapped). Reported as a typo, before the mailbox is
 * asked anything.
 */
export class PairingCodeTypo extends SyncCryptoError {
  constructor(readonly problem: PairingCodeProblem) {
    super(`sync: the pairing code has a typo (${problem})`);
    this.name = "PairingCodeTypo";
  }
}
