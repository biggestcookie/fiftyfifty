import { getHeader, readRawBody, setResponseStatus, type H3Event } from "h3";

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** Shared-check JSON bodies are capped well below the platform limit. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

export interface JsonObjectResult {
  body: Record<string, unknown> | null;
  tooLarge: boolean;
}

/** Uniform error shape for every `/api/*` route. Never include check data. */
export function apiError(
  event: H3Event,
  status: number,
  code: string,
  message: string
): ApiErrorBody {
  setResponseStatus(event, status);
  return { error: { code, message } };
}

/**
 * Returns a JSON object body, or flags malformed/oversized input so the caller
 * can return `400`/`413`. The declared length is checked before buffering, then
 * the actual UTF-8 byte length is checked as a backstop.
 */
export async function readJsonObject(
  event: H3Event,
  maxBytes: number = MAX_JSON_BODY_BYTES
): Promise<JsonObjectResult> {
  const declaredLength = Number(getHeader(event, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { body: null, tooLarge: true };
  }

  let raw: string | undefined;
  try {
    raw = await readRawBody(event, "utf8");
  } catch {
    return { body: null, tooLarge: false };
  }
  if (raw === undefined) return { body: null, tooLarge: false };
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return { body: null, tooLarge: true };
  }

  try {
    const body = JSON.parse(raw);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { body: null, tooLarge: false };
    }
    return { body: body as Record<string, unknown>, tooLarge: false };
  } catch {
    return { body: null, tooLarge: false };
  }
}
