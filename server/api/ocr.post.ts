import { GoogleGenAI, Type, type Schema } from "@google/genai";
import {
  normalizeLines,
  printedTotal,
  receiptConfidence,
} from "~~/server/utils/receipt-ocr";

/**
 * Server-side receipt OCR. The cropped photo is sent here by the client,
 * passed to Gemini in memory, and never stored or logged. On any provider or
 * network problem the client falls back to the on-device PaddleOCR path.
 */

const MODEL = "gemini-3.5-flash-lite";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 25_000;
const MAX_ITEMS = 80;
const MAX_FEES = 12;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const PROMPT = `You extract line items and fees from a photo of a printed receipt.

Rules:
- Return only data visible in the image. Never invent items or fees.
- items: one entry per purchased line item. Use the printed name (no quantity prefix) and that line's printed price.
- fees: charged tax and charged service charges / auto-gratuities only. Preserve the printed wording (for example "Tax", "Service Charge (18%)").
- Exclude suggested tips, tip guides, subtotals, grand totals, amounts paid, change, discounts, loyalty balances, payment handles, and card or bank numbers.
- If a discount reduces a line, use the net price for that line.
- total: the printed grand total as a number when the receipt shows one; omit it otherwise.
- If the photo is not a receipt or the text is unreadable, return empty items and fees arrays.
- Amounts must be positive numbers with a dot decimal separator and no currency symbols.`;

const lineItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    label: {
      type: Type.STRING,
      description:
        "Printed name of the item or fee, without a quantity prefix.",
    },
    amount: {
      type: Type.NUMBER,
      description: "Positive amount in the receipt currency, dot decimal.",
    },
  },
  required: ["label", "amount"],
};

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      description:
        "Purchased line items, excluding totals, tips, and payments.",
      items: lineItemSchema,
    },
    fees: {
      type: Type.ARRAY,
      description: "Charged tax and charged service charges only.",
      items: lineItemSchema,
    },
    total: {
      type: Type.NUMBER,
      description:
        "Printed grand total if one is visible. Used only to sanity-check the extraction.",
      nullable: true,
    },
  },
  required: ["items", "fees"],
};

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");

  const parts = await readMultipartFormData(event).catch(() => undefined);
  if (!parts) {
    return apiError(
      event,
      400,
      "invalid_image",
      "Send the receipt as multipart form data."
    );
  }

  const imageParts = parts.filter(
    (part) => typeof part.type === "string" && part.type.startsWith("image/")
  );
  if (imageParts.length === 0) {
    return apiError(event, 400, "missing_image", "No receipt image was found.");
  }
  if (imageParts.length > 1) {
    return apiError(
      event,
      400,
      "too_many_images",
      "Send exactly one receipt image."
    );
  }

  const [image] = imageParts;
  if (!image) {
    return apiError(event, 400, "missing_image", "No receipt image was found.");
  }
  const mimeType = image.type;
  if (!mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return apiError(
      event,
      400,
      "unsupported_image_type",
      "Use a JPEG, PNG, or WebP image."
    );
  }
  if (image.data.length > MAX_IMAGE_BYTES) {
    return apiError(
      event,
      413,
      "image_too_large",
      "The receipt image must be 4 MB or smaller."
    );
  }

  // Netlify AI Gateway injects GEMINI_API_KEY and GOOGLE_GEMINI_BASE_URL, so
  // the SDK needs no explicit credentials. Never log the image or its data.
  const ai = new GoogleGenAI({});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let payload: Record<string, unknown> | null = null;
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: image.data.toString("base64") } },
            { text: PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        abortSignal: controller.signal,
      },
    });

    const { text } = response;
    if (!text) {
      return apiError(
        event,
        502,
        "ocr_empty",
        "The scanner could not read that receipt."
      );
    }

    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return apiError(
        event,
        502,
        "ocr_failed",
        "The scanner could not read that receipt."
      );
    }
    payload = parsed as Record<string, unknown>;
  } catch (e) {
    // TEMP DIAGNOSTICS — remove after the production check.
    const err = e as {
      name?: string;
      message?: string;
      status?: number;
      cause?: { message?: string };
    };
    const clean = (value?: string) =>
      value
        ?.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]")
        .slice(0, 500);
    if (controller.signal.aborted) {
      return {
        ...apiError(
          event,
          504,
          "ocr_timeout",
          "The scanner took too long to respond."
        ),
        debug: { aborted: true },
      };
    }
    return {
      ...apiError(
        event,
        502,
        "ocr_failed",
        "The scanner could not read that receipt."
      ),
      debug: {
        name: err?.name,
        message: clean(err?.message),
        status: err?.status,
        cause: clean(err?.cause?.message),
        hasKey: Boolean(process.env.GEMINI_API_KEY),
        hasBase: Boolean(process.env.GOOGLE_GEMINI_BASE_URL),
      },
    };
  } finally {
    clearTimeout(timer);
  }

  if (!payload) {
    return apiError(
      event,
      502,
      "ocr_failed",
      "The scanner could not read that receipt."
    );
  }

  const items = normalizeLines(payload.items, MAX_ITEMS);
  const fees = normalizeLines(payload.fees, MAX_FEES);
  if (items.length === 0 && fees.length === 0) {
    return apiError(
      event,
      502,
      "ocr_empty",
      "The scanner could not read that receipt."
    );
  }

  const total = printedTotal(payload.total);
  const confidence = receiptConfidence(items, fees, total);

  return { items, fees, confidence };
});
