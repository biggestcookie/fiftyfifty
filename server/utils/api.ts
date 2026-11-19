import { readBody, setResponseStatus, type H3Event } from "h3";

export interface ApiErrorBody {
  error: { code: string; message: string };
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

/** Returns null for malformed JSON or non-object bodies (the caller returns 400). */
export async function readJsonObject(
  event: H3Event
): Promise<Record<string, unknown> | null> {
  try {
    const body = await readBody(event);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return null;
    }
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}
