import {
  FeesMode,
  type Fee,
  type Guest,
  type Item,
  type SharedCheck,
} from "../types/check";

const MAX_GUESTS = 50;
const MAX_ITEMS = 200;
const MAX_FEES = 20;

const MAX_ID_LENGTH = 64;
const MAX_GUEST_NAME_LENGTH = 100;
const MAX_ITEM_LABEL_LENGTH = 200;
const MAX_CHECK_NAME_LENGTH = 100;
const MAX_HANDLE_LENGTH = 100;
const MAX_AMOUNT = 1_000_000;

/**
 * Unknown top-level keys are rejected so a client bug cannot persist owner-only
 * metadata (edit token, totals, local ids) in the shared document.
 */
const ALLOWED_FIELDS = new Set([
  "guests",
  "items",
  "fees",
  "feesMode",
  "currencySymbol",
  "name",
  "venmoHandle",
  "zelleHandle",
]);

export class SharedCheckValidationError extends Error {}

function fail(message: string): never {
  throw new SharedCheckValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${field} must be a non-empty string`);
  }
  if (value.length > MAX_ID_LENGTH) fail(`${field} is too long`);
  return value;
}

function parseLabel(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") fail(`${field} must be a string`);
  if (value.length > maxLength) fail(`${field} is too long`);
  return value;
}

function parseAmount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${field} must be a finite number`);
  }
  if (value < 0 || value > MAX_AMOUNT) {
    fail(`${field} is out of range`);
  }
  return value;
}

function parseArray(
  value: unknown,
  field: string,
  maxLength: number
): unknown[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  if (value.length > maxLength) fail(`${field} has too many entries`);
  return value;
}

function parseOptionalString(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") fail(`${field} must be a string`);
  if (value.length > maxLength) fail(`${field} is too long`);
  return value.length > 0 ? value : undefined;
}

function parseGuests(value: unknown): Guest[] {
  return parseArray(value, "guests", MAX_GUESTS).map((raw, index) => {
    if (!isRecord(raw)) fail(`guests[${index}] must be an object`);
    const guest: Guest = {
      id: parseId(raw.id, `guests[${index}].id`),
    };
    const name = parseOptionalString(
      raw.name,
      `guests[${index}].name`,
      MAX_GUEST_NAME_LENGTH
    );
    if (name !== undefined) guest.name = name;
    return guest;
  });
}

function parseItems(value: unknown, guestIds: Set<string>): Item[] {
  return parseArray(value, "items", MAX_ITEMS).map((raw, index) => {
    if (!isRecord(raw)) fail(`items[${index}] must be an object`);
    if (!Array.isArray(raw.guestIds)) {
      fail(`items[${index}].guestIds must be an array`);
    }

    const seen = new Set<string>();
    const itemGuestIds = raw.guestIds.map((gid, guestIndex) => {
      const field = `items[${index}].guestIds[${guestIndex}]`;
      const id = parseId(gid, field);
      if (!guestIds.has(id)) fail(`${field} references an unknown guest`);
      if (seen.has(id)) fail(`${field} is a duplicate`);
      seen.add(id);
      return id;
    });

    return {
      id: parseId(raw.id, `items[${index}].id`),
      label: parseLabel(
        raw.label,
        `items[${index}].label`,
        MAX_ITEM_LABEL_LENGTH
      ),
      amount: parseAmount(raw.amount, `items[${index}].amount`),
      guestIds: itemGuestIds,
    };
  });
}

function parseFees(value: unknown): Fee[] {
  return parseArray(value, "fees", MAX_FEES).map((raw, index) => {
    if (!isRecord(raw)) fail(`fees[${index}] must be an object`);
    return {
      id: parseId(raw.id, `fees[${index}].id`),
      label: parseLabel(
        raw.label,
        `fees[${index}].label`,
        MAX_ITEM_LABEL_LENGTH
      ),
      amount: parseAmount(raw.amount, `fees[${index}].amount`),
    };
  });
}

/**
 * Validate and normalise the shared subset of a check. Throws
 * `SharedCheckValidationError` on any shape, limit, or unknown-field problem.
 *
 * `includePayment: false` strips payment handles from the returned copy; the
 * owner's local check keeps them.
 */
export function parseSharedCheck(
  value: unknown,
  options: { includePayment?: boolean } = {}
): SharedCheck {
  if (!isRecord(value)) fail("check must be an object");

  for (const key of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(key)) fail(`unknown field: ${key}`);
  }

  const guests = parseGuests(value.guests);
  const guestIds = new Set(guests.map((guest) => guest.id));
  const items = parseItems(value.items, guestIds);
  const fees = parseFees(value.fees);

  if (
    value.feesMode !== FeesMode.Proportional &&
    value.feesMode !== FeesMode.Equal
  ) {
    fail("feesMode must be proportional or equal");
  }

  if (
    typeof value.currencySymbol !== "string" ||
    value.currencySymbol.length < 1 ||
    value.currencySymbol.length > 4
  ) {
    fail("currencySymbol must be 1-4 characters");
  }

  const check: SharedCheck = {
    guests,
    items,
    fees,
    feesMode: value.feesMode,
    currencySymbol: value.currencySymbol,
  };

  const name = parseOptionalString(value.name, "name", MAX_CHECK_NAME_LENGTH);
  if (name !== undefined) check.name = name;

  if (options.includePayment !== false) {
    const venmoHandle = parseOptionalString(
      value.venmoHandle,
      "venmoHandle",
      MAX_HANDLE_LENGTH
    );
    if (venmoHandle !== undefined) check.venmoHandle = venmoHandle;

    const zelleHandle = parseOptionalString(
      value.zelleHandle,
      "zelleHandle",
      MAX_HANDLE_LENGTH
    );
    if (zelleHandle !== undefined) check.zelleHandle = zelleHandle;
  }

  return check;
}
