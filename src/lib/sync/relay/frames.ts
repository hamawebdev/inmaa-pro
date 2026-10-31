/**
 * A page of envelopes in one binary body, never base64 in JSON (the Worker's 10 ms of CPU):
 *
 *     repeated: [u32 BE: head length] [head: UTF-8 JSON] [u32 BE: body length] [body]
 *
 * The Worker's copy is `relay/src/frames.ts`; a test checks that the two agree.
 */

export interface EnvelopeHead {
  /** The mailbox's own sequence: the order of listing, cursors and acknowledgements. */
  mseq: number;
  deviceId: string;
  /** The device's own envelope number. */
  seq: number;
  keyId: string;
  kind: string;
  /** When the mailbox stored it, ms on its clock. */
  at: number;
}

export function encodeFrames(records: { head: EnvelopeHead; body: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const heads = records.map((r) => encoder.encode(JSON.stringify(r.head)));
  const total = records.reduce((sum, r, i) => sum + 8 + heads[i].byteLength + r.body.byteLength, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;
  records.forEach((r, i) => {
    view.setUint32(offset, heads[i].byteLength);
    out.set(heads[i], offset + 4);
    offset += 4 + heads[i].byteLength;
    view.setUint32(offset, r.body.byteLength);
    out.set(r.body, offset + 4);
    offset += 4 + r.body.byteLength;
  });
  return out;
}

export function decodeFrames(bytes: Uint8Array): { head: EnvelopeHead; body: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const out: { head: EnvelopeHead; body: Uint8Array }[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (offset + 4 > bytes.byteLength) throw new Error("relay: a listing frame is cut");
    const headLength = view.getUint32(offset);
    const headEnd = offset + 4 + headLength;
    if (headEnd + 4 > bytes.byteLength) throw new Error("relay: a listing frame is cut");
    const head = JSON.parse(decoder.decode(bytes.subarray(offset + 4, headEnd))) as EnvelopeHead;
    const bodyLength = view.getUint32(headEnd);
    const bodyEnd = headEnd + 4 + bodyLength;
    if (bodyEnd > bytes.byteLength) throw new Error("relay: a listing frame is cut");
    out.push({ head, body: bytes.slice(headEnd + 4, bodyEnd) });
    offset = bodyEnd;
  }
  return out;
}
