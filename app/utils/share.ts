import type { Check } from "~/types/check";

const LEGACY_VERSION_PREFIX = "v1.";
const VERSION_PREFIX = "v2.";

/**
 * Payloads (including the version prefix) must stay under this many
 * characters so the resulting share URL remains short enough to paste.
 */
const MAX_SHARE_PAYLOAD_CHARS = 8000;

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64_ALPHABET.length; i++) {
  B64_LOOKUP[B64_ALPHABET.charAt(i)] = i;
}

export type SharedCheckPayload = Omit<
  Check,
  "id" | "createdAt" | "totals" | "updatedAt" | "currentStep"
>;

interface RequiredField {
  name: string;
  isValid: (value: unknown) => boolean;
}

const REQUIRED_FIELDS: RequiredField[] = [
  { name: "guests", isValid: (value) => Array.isArray(value) },
  { name: "items", isValid: (value) => Array.isArray(value) },
  {
    name: "fees",
    isValid: (value) =>
      Array.isArray(value) &&
      value.every(
        (f) =>
          typeof f === "object" &&
          f !== null &&
          typeof (f as Record<string, unknown>).label === "string" &&
          typeof (f as Record<string, unknown>).amount === "number" &&
          typeof (f as Record<string, unknown>).id === "string"
      ),
  },
  { name: "currencySymbol", isValid: (value) => typeof value === "string" },
  { name: "feesMode", isValid: (value) => typeof value === "string" },
];

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 3] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    out += B64_ALPHABET.charAt(b0 >> 2);
    out += B64_ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    if (i + 1 < bytes.length) {
      out += B64_ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6));
    }
    if (i + 2 < bytes.length) {
      out += B64_ALPHABET.charAt(b2 & 0x3f);
    }
  }
  return out;
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const value = B64_LOOKUP[s.charAt(i)];
    if (value === undefined) {
      throw new Error("Invalid base64url payload");
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
      if (bits === 0) {
        buffer = 0;
      } else {
        buffer &= (1 << bits) - 1;
      }
    }
  }
  return new Uint8Array(out);
}

async function compress(
  bytes: Uint8Array<ArrayBuffer>,
  format: CompressionFormat
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream(format));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function decompress(
  bytes: Uint8Array<ArrayBuffer>,
  format: CompressionFormat
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * TypeScript's `CompressionFormat` lib type predates brotli; runtime
 * supports `"brotli"` in every modern browser. Cast at the boundary.
 */
const BROTLI = "brotli" as CompressionFormat;

/**
 * Short keys used in the on-the-wire v2 payload.
 */
interface ShortItem {
  i: string;
  l: string;
  a: number;
  g: string[];
}

interface ShortGuest {
  i: string;
  n?: string;
}

interface ShortFee {
  i: string;
  l: string;
  a: number;
}

interface ShortPayload {
  g: ShortGuest[];
  i: ShortItem[];
  f: ShortFee[];
  m: string;
  s: string;
  v?: string;
  z?: string;
}

function encodeShort(check: SharedCheckPayload): ShortPayload {
  return {
    g: check.guests.map((g) => (g.name ? { i: g.id, n: g.name } : { i: g.id })),
    i: check.items.map((it) => ({
      i: it.id,
      l: it.label,
      a: it.amount,
      g: it.guestIds,
    })),
    f: check.fees.map((f) => ({ i: f.id, l: f.label, a: f.amount })),
    m: check.feesMode,
    s: check.currencySymbol,
    v: check.venmoHandle,
    z: check.zelleHandle,
  };
}

function decodeShort(payload: ShortPayload): SharedCheckPayload {
  const out: Record<string, unknown> = {
    guests: payload.g.map((g) => (g.n ? { id: g.i, name: g.n } : { id: g.i })),
    items: payload.i.map((it) => ({
      id: it.i,
      label: it.l,
      amount: it.a,
      guestIds: it.g,
    })),
    fees: payload.f.map((f) => ({ id: f.i, label: f.l, amount: f.a })),
    feesMode: payload.m,
    currencySymbol: payload.s,
  };
  if (payload.v) out.venmoHandle = payload.v;
  if (payload.z) out.zelleHandle = payload.z;
  return out as unknown as SharedCheckPayload;
}

export async function encodeCheck(check: Check): Promise<string> {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    currentStep: _currentStep,
    totals: _totals,
    ...data
  } = check;

  const short = encodeShort(data as SharedCheckPayload);
  const json = JSON.stringify(short);
  const compressed = await compress(
    new TextEncoder().encode(json),
    BROTLI
  );
  const encoded = bytesToBase64Url(compressed);
  const payload = `${VERSION_PREFIX}${encoded}`;
  if (payload.length > MAX_SHARE_PAYLOAD_CHARS) {
    throw new Error("Check is too large to share");
  }
  return payload;
}

export async function decodeCheck(
  payload: string
): Promise<SharedCheckPayload> {
  if (payload.startsWith(VERSION_PREFIX)) {
    const bytes = base64UrlToBytes(payload.slice(VERSION_PREFIX.length));
    const decompressed = await decompress(bytes, BROTLI);
    const json = new TextDecoder().decode(decompressed);
    const short = JSON.parse(json) as ShortPayload;
    return decodeShort(short);
  }

  if (payload.startsWith(LEGACY_VERSION_PREFIX)) {
    const bytes = base64UrlToBytes(payload.slice(LEGACY_VERSION_PREFIX.length));
    const decompressed = await decompress(bytes, "gzip");
    const json = new TextDecoder().decode(decompressed);
    const long = migrateLegacyPayment(validateSharedPayload(JSON.parse(json)));
    return long;
  }

  throw new Error("Unsupported share payload version");
}

/**
 * Old payloads stored a single `paymentMethod` + `paymentHandle` pair.
 * The new shape has independent `venmoHandle` / `zelleHandle` fields, so
 * translate the legacy pair here before the check reaches the UI.
 */
function migrateLegacyPayment(
  payload: SharedCheckPayload
): SharedCheckPayload {
  const legacy = (payload as unknown as Record<string, unknown>).paymentMethod;
  const handle = (payload as unknown as Record<string, unknown>).paymentHandle;
  if (typeof legacy !== "string" || typeof handle !== "string") {
    return payload;
  }
  const record = payload as unknown as Record<string, unknown>;
  if (legacy === "venmo") record.venmoHandle = handle;
  else if (legacy === "zelle") record.zelleHandle = handle;
  delete record.paymentMethod;
  delete record.paymentHandle;
  return record as unknown as SharedCheckPayload;
}

function validateSharedPayload(value: unknown): SharedCheckPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid shared check: missing guests");
  }
  const record = value as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (!field.isValid(record[field.name])) {
      throw new Error(`Invalid shared check: missing ${field.name}`);
    }
  }
  return record as unknown as SharedCheckPayload;
}

export function buildShareUrl(payload: string): string {
  return `${window.location.origin}/share/${payload}`;
}
