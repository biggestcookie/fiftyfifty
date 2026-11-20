import { describe, expect, test } from "bun:test";
import { createEvent } from "h3";
import { MAX_JSON_BODY_BYTES, readJsonObject } from "../server/utils/api";

function jsonEvent(body: string, headers: Record<string, string> = {}) {
  return createEvent(
    new Request("http://localhost/api/checks", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    })
  );
}

describe("readJsonObject", () => {
  test("parses a JSON object", async () => {
    const result = await readJsonObject(jsonEvent('{"check":{}}'));
    expect(result.tooLarge).toBe(false);
    expect(result.body).toEqual({ check: {} });
  });

  test("rejects arrays, primitives, and malformed JSON", async () => {
    for (const body of ["[]", "null", '"text"', "{oops"]) {
      const result = await readJsonObject(jsonEvent(body));
      expect(result.tooLarge).toBe(false);
      expect(result.body).toBeNull();
    }
  });

  test("flags bodies above the 64 KB cap", async () => {
    const body = JSON.stringify({ name: "x".repeat(MAX_JSON_BODY_BYTES) });
    const result = await readJsonObject(jsonEvent(body));
    expect(result.tooLarge).toBe(true);
    expect(result.body).toBeNull();
  });

  test("accepts a custom lower cap", async () => {
    const result = await readJsonObject(jsonEvent('{"a":1}'), 4);
    expect(result.tooLarge).toBe(true);
  });
});
