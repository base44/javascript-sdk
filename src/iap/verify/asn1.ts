/**
 * A minimal DER reader, enough to walk an X.509 certificate.
 *
 * Scope on purpose: this reads the handful of fields certificate-chain
 * validation needs and nothing else. It is a *reader* only — nothing here
 * encodes. It is strict where laxness would be a security hole:
 *
 * - Definite-length form only. Indefinite length (BER, `0x80`) is rejected.
 * - A length that runs past the end of the buffer is rejected, never clamped.
 * - Every accessor is bounds-checked and throws rather than returning a
 *   partial value.
 *
 * The one thing callers must be able to get at is the *raw* bytes of a node
 * including its header, because a certificate signature covers the encoded
 * `tbsCertificate`, not a re-encoding of its contents.
 *
 * @internal
 */

/** DER tag numbers this module recognises. */
export const Tag = {
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OBJECT_IDENTIFIER: 0x06,
  UTF8_STRING: 0x0c,
  SEQUENCE: 0x30,
  SET: 0x31,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  BOOLEAN: 0x01,
} as const;

/** Thrown for input that is not well-formed DER. */
export class DerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerError";
  }
}

/** One parsed tag-length-value triple, described by offsets into the source buffer. */
export interface DerNode {
  /** The tag byte. */
  readonly tag: number;
  /** Offset of the tag byte. */
  readonly start: number;
  /** Offset of the first content byte. */
  readonly contentStart: number;
  /** Content length in bytes. */
  readonly length: number;
  /** Offset one past the final content byte, i.e. the start of the next node. */
  readonly end: number;
}

/** Reads one node at `offset`. */
export function readNode(buf: Uint8Array, offset: number): DerNode {
  if (offset >= buf.length) {
    throw new DerError(`truncated: no tag byte at offset ${offset}`);
  }

  const tag = buf[offset];
  let cursor = offset + 1;

  if (cursor >= buf.length) {
    throw new DerError(`truncated: no length byte at offset ${cursor}`);
  }

  const first = buf[cursor];
  cursor += 1;
  let length: number;

  if (first < 0x80) {
    // Short form: the byte is the length.
    length = first;
  } else if (first === 0x80) {
    throw new DerError(
      "indefinite length is BER, not DER, and is not accepted here"
    );
  } else {
    const byteCount = first & 0x7f;
    // 4 bytes is 4 GiB; anything longer is either hostile or a parse desync.
    // Stopping here also keeps the arithmetic below inside a safe integer.
    if (byteCount > 4) {
      throw new DerError(`length field of ${byteCount} bytes is unreasonable`);
    }
    if (cursor + byteCount > buf.length) {
      throw new DerError("truncated: length field runs past the end");
    }
    length = 0;
    for (let i = 0; i < byteCount; i += 1) {
      length = length * 256 + buf[cursor + i];
    }
    cursor += byteCount;
  }

  const end = cursor + length;
  if (end > buf.length) {
    throw new DerError(
      `truncated: node at ${offset} claims ${length} content bytes but only ` +
        `${buf.length - cursor} remain`
    );
  }

  return { tag, start: offset, contentStart: cursor, length, end };
}

/** Reads one node at `offset` and asserts its tag. */
export function readNodeOfTag(
  buf: Uint8Array,
  offset: number,
  tag: number,
  what: string
): DerNode {
  const node = readNode(buf, offset);
  if (node.tag !== tag) {
    throw new DerError(
      `expected ${what} (tag 0x${tag.toString(16)}) at offset ${offset}, ` +
        `found tag 0x${node.tag.toString(16)}`
    );
  }
  return node;
}

/** The node's content bytes, without its header. A view, not a copy. */
export function content(buf: Uint8Array, node: DerNode): Uint8Array {
  return buf.subarray(node.contentStart, node.end);
}

/**
 * The node's complete encoding, header included.
 *
 * This is what a signature covers. Re-encoding the parsed contents instead
 * would be a bug: DER has canonical forms, but a signer's bytes are the only
 * bytes that verify.
 */
export function raw(buf: Uint8Array, node: DerNode): Uint8Array {
  return buf.subarray(node.start, node.end);
}

/** Every immediate child of a constructed node, in order. */
export function children(buf: Uint8Array, node: DerNode): DerNode[] {
  const out: DerNode[] = [];
  let cursor = node.contentStart;
  while (cursor < node.end) {
    const child = readNode(buf, cursor);
    out.push(child);
    if (child.end <= cursor) {
      throw new DerError("zero-length advance while walking children");
    }
    cursor = child.end;
  }
  return out;
}

/** The child at `index`, or `undefined` when the node has fewer children. */
export function childAt(
  buf: Uint8Array,
  node: DerNode,
  index: number
): DerNode | undefined {
  return children(buf, node)[index];
}

/**
 * Decodes an OBJECT IDENTIFIER to dotted-decimal form.
 *
 * The first byte packs two arcs: `40 * first + second`, with the first arc
 * capped at 2. Every later arc is base-128 with the high bit as a
 * continuation flag.
 */
export function readOid(buf: Uint8Array, node: DerNode): string {
  if (node.tag !== Tag.OBJECT_IDENTIFIER) {
    throw new DerError(
      `expected OBJECT IDENTIFIER, found tag 0x${node.tag.toString(16)}`
    );
  }
  const bytes = content(buf, node);
  if (bytes.length === 0) throw new DerError("empty OBJECT IDENTIFIER");

  const first = Math.min(Math.floor(bytes[0] / 40), 2);
  const second = bytes[0] - first * 40;
  const arcs: number[] = [first, second];

  let value = 0;
  let started = false;
  for (let i = 1; i < bytes.length; i += 1) {
    const byte = bytes[i];
    // Guard against an arc wide enough to lose precision in a double.
    if (value > Number.MAX_SAFE_INTEGER / 128) {
      throw new DerError("OBJECT IDENTIFIER arc is too large");
    }
    value = value * 128 + (byte & 0x7f);
    started = true;
    if ((byte & 0x80) === 0) {
      arcs.push(value);
      value = 0;
      started = false;
    }
  }
  if (started) {
    throw new DerError("OBJECT IDENTIFIER ends mid-arc");
  }

  return arcs.join(".");
}

/**
 * Decodes a BIT STRING's payload, dropping the unused-bits count byte.
 *
 * Every BIT STRING this module reads — a SubjectPublicKey, a certificate
 * signature — is byte-aligned, so a non-zero unused-bits count means the
 * parse has gone wrong and is rejected rather than shifted.
 */
export function readBitString(buf: Uint8Array, node: DerNode): Uint8Array {
  if (node.tag !== Tag.BIT_STRING) {
    throw new DerError(`expected BIT STRING, found tag 0x${node.tag.toString(16)}`);
  }
  const bytes = content(buf, node);
  if (bytes.length === 0) throw new DerError("empty BIT STRING");
  const unused = bytes[0];
  if (unused !== 0) {
    throw new DerError(
      `BIT STRING has ${unused} unused bits; only byte-aligned values are supported`
    );
  }
  return bytes.subarray(1);
}

/**
 * Decodes an INTEGER's magnitude with any DER sign padding removed.
 *
 * DER prepends a zero byte when the high bit would otherwise read as
 * negative. ECDSA `r` and `s` are unsigned, so that byte must go before the
 * value is padded to its fixed width.
 */
export function readUnsignedInteger(buf: Uint8Array, node: DerNode): Uint8Array {
  if (node.tag !== Tag.INTEGER) {
    throw new DerError(`expected INTEGER, found tag 0x${node.tag.toString(16)}`);
  }
  const bytes = content(buf, node);
  if (bytes.length === 0) throw new DerError("empty INTEGER");
  if ((bytes[0] & 0x80) !== 0) {
    throw new DerError("negative INTEGER where an unsigned value was expected");
  }
  let offset = 0;
  while (offset < bytes.length - 1 && bytes[offset] === 0) offset += 1;
  return bytes.subarray(offset);
}

const TIME_PATTERN = /^(\d{2}|\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/;

/**
 * Decodes a UTCTime or GeneralizedTime to epoch milliseconds.
 *
 * Only the UTC (`Z`) form is accepted. Certificates may legally carry a
 * numeric offset, but Apple's do not, and accepting one would mean
 * hand-rolling timezone arithmetic for no gain.
 *
 * Per RFC 5280, a two-digit UTCTime year of 50 or more means 19xx, and less
 * than 50 means 20xx.
 */
export function readTime(buf: Uint8Array, node: DerNode): number {
  if (node.tag !== Tag.UTC_TIME && node.tag !== Tag.GENERALIZED_TIME) {
    throw new DerError(
      `expected UTCTime or GeneralizedTime, found tag 0x${node.tag.toString(16)}`
    );
  }

  const bytes = content(buf, node);
  let text = "";
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);

  const match = TIME_PATTERN.exec(text);
  if (!match) {
    throw new DerError(`unsupported time format: ${JSON.stringify(text)}`);
  }

  const [, rawYear, month, day, hour, minute, second] = match;
  let year: number;
  if (node.tag === Tag.UTC_TIME) {
    if (rawYear.length !== 2) {
      throw new DerError("UTCTime must carry a two-digit year");
    }
    const yy = Number(rawYear);
    year = yy >= 50 ? 1900 + yy : 2000 + yy;
  } else {
    if (rawYear.length !== 4) {
      throw new DerError("GeneralizedTime must carry a four-digit year");
    }
    year = Number(rawYear);
  }

  const ms = Date.UTC(
    year,
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    second ? Number(second) : 0
  );
  if (Number.isNaN(ms)) {
    throw new DerError(`invalid time value: ${JSON.stringify(text)}`);
  }
  return ms;
}
