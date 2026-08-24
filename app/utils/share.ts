import type { Check } from "~/types/check";

const VERSION_PREFIX = "v1.";

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
  { name: "tax", isValid: (value) => typeof value === "number" },
  { name: "tip", isValid: (value) => typeof value === "number" },
  { name: "currencySymbol", isValid: (value) => typeof value === "string" },
  { name: "taxTipMode", isValid: (value) => typeof value === "string" },
];

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
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

async function gzip(
  bytes: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(
  bytes: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
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

  const compressed = await gzip(new TextEncoder().encode(JSON.stringify(data)));
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
  if (!payload.startsWith(VERSION_PREFIX)) {
    throw new Error("Unsupported share payload version");
  }
  const bytes = base64UrlToBytes(payload.slice(VERSION_PREFIX.length));
  const decompressed = await gunzip(bytes);
  const json = new TextDecoder().decode(decompressed);
  return validateSharedPayload(JSON.parse(json));
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
