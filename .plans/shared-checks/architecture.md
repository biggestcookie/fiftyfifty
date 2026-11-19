# Shared Checks — Architecture Deep Dive

## 1. Terminology

- **Share ID** — the public, unguessable read capability in `/s/<shareId>`.
- **Edit token** — the owner’s write capability. Never appears in a URL.
- **Shared check** — the subset of `Check` that is safe to expose to
  recipients: guests, items, fees, fees mode, currency, name, payment handles.
- **Active document** — a Blobs record with a shared check and metadata.
- **Tombstone** — a Blobs record with only `status`, `expiredAt`, `lastVersion`.
  No check data, no receipt data, no edit-token hash, no PII.

## 2. Types

Move the canonical types to `shared/types/check.ts`. Keep
`app/types/check.ts` as a re-export so existing imports keep working.

```ts
export interface ShareRef {
  shareId: string;
  editToken: string; // owner only; never sent to the server
  expiresAt: number;
  version: number;
  /** Whether the last share included a Venmo/Zelle handle. */
  sharedWithPayment: boolean;
  pendingSync?: boolean;
}

export interface Check extends Draft {
  id: string;
  createdAt: number;
  totals: Record<string, number>;
  share?: ShareRef;
}

/**
 * The fields the current v2 share payload exposes. This is the shared check
 * document stored in Blobs. The local check id/timestamps/currentStep and the
 * edit token are deliberately excluded.
 */
export type SharedCheck = Omit<
  Check,
  "id" | "createdAt" | "updatedAt" | "totals" | "currentStep" | "share"
>;
```

The server document stores the shared check plus server metadata:

```ts
interface SharedCheckDocument {
  schemaVersion: 1;
  shareId: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  editTokenHash: string;
  check: SharedCheck;
  totals: Record<string, number>;
}

interface Tombstone {
  schemaVersion: 1;
  shareId: string;
  status: "expired" | "revoked";
  expiredAt: number;
  lastVersion: number;
}
```

## 3. Blobs layout

Store name: `fiftyfifty`.

```text
checks/<shareId>.json   active document OR tombstone
```

One key per shared check. No index. No list endpoint. A cleanup function uses
`list({ prefix: "checks/" })`.

Use strong consistency reads and conditional writes:

```ts
const store = getStore({ name: "fiftyfifty", consistency: "strong" });

// read
const entry = await store.getWithMetadata(`checks/${id}`, {
  type: "json",
  consistency: "strong",
});

// create without overwriting a collision
await store.setJSON(key, doc, { onlyIfNew: true });

// update only if unchanged since the read
await store.setJSON(key, next, { onlyIfMatch: entry.etag });
```

`setJSON` returns `{ modified, etag }`. If `onlyIfNew` returns
`modified: false`, retry with a new ID. If `onlyIfMatch` returns
`modified: false`, treat it as a version conflict.

## 4. HTTP API

All routes are same-origin. No CORS. All responses use:

```text
Cache-Control: no-store
X-Robots-Tag: noindex, nofollow
Referrer-Policy: no-referrer
```

Error body shape:

```json
{ "error": { "code": "expired", "message": "This shared check expired." } }
```

### `POST /api/checks`

Create a new shared check.

Request:

```json
{
  "check": { "guests": [], "items": [], "fees": [], "...": "..." },
  "includePayment": true
}
```

- Validate `check` with `parseSharedCheck`.
- If `includePayment === false`, strip `venmoHandle` and `zelleHandle` from the
  stored copy. The local owner check keeps them.
- Compute totals server-side with `computeTotals`; ignore any client-supplied
  totals.
- Generate:
  - `shareId`: 16 URL-safe base64url chars from 12 random bytes
  - `editToken`: 43 URL-safe base64url chars from 32 random bytes
  - `editTokenHash`: SHA-256 of the edit token
- Create `checks/<shareId>.json` with `expiresAt = now + 7 days`.
- Return `201`:

```json
{
  "shareId": "...",
  "editToken": "...",
  "expiresAt": 1760604800000,
  "version": 1
}
```

The edit token is returned exactly once. The client stores it in the local
check’s `share` metadata.

### `GET /api/checks/:id`

Public read.

- Missing → `404` `{ code: "not_found" }`.
- Tombstone (`expired`/`revoked`) → `410` `{ code: "expired" | "revoked" }`.
- Active but `expiresAt <= now`:
  - overwrite the document with an `expired` tombstone (delete PII)
  - return `410`
- Active and not expired → `200`:

```json
{
  "shareId": "...",
  "version": 4,
  "updatedAt": 1760000000000,
  "expiresAt": 1760604800000,
  "check": { "...": "..." },
  "totals": { "guest-id": 42.5 }
}
```

Do **not** return `editTokenHash`. Do **not** extend `expiresAt` on read.

### `PATCH /api/checks/:id`

Owner update.

Headers:

```text
Authorization: Bearer <editToken>
```

Request:

```json
{
  "check": { "...": "..." },
  "version": 4,
  "includePayment": true
}
```

- Missing → `404`.
- Tombstone/expired → `410`.
- Missing/invalid edit token → `403`.
- `version` mismatch → `409` (client may refetch and retry once).
- Validate `check`, strip payment handles if `includePayment === false`,
  recompute totals.
- Increment `version`, set `updatedAt = now`, set
  `expiresAt = now + 7 days` (sliding from last edit).
- Write with `onlyIfMatch` using the ETag from the read.
- Return `200` `{ version, updatedAt, expiresAt }`.

The edit token is never included in a response, a URL, or a log.

### `DELETE /api/checks/:id`

Owner revoke.

- Auth as above.
- Missing → `404`; already tombstone → treat as success.
- Replace the document with a `revoked` tombstone, deleting all check data,
  totals, and the edit-token hash.
- Return `204`.
- Old URL returns `410` until the tombstone is cleaned up, then `404`.

### `POST /api/ocr`

Stateless server OCR.

- `multipart/form-data` with one image field.
- Max 4 MB binary; accepted types: `image/jpeg`, `image/png`, `image/webp`.
- Decode in memory, send to Gemini, parse the JSON, discard the image.
- Never write the image or OCR text to Blobs, logs, or telemetry.
- Return `{ items, fees, confidence }` in the shape `replaceFromScan` already
  consumes.
- On invalid/unsupported image → `400`; on provider failure/timeout → `502` or
  `504` so the client can fall back to on-device OCR.

## 5. Validation and totals

Create `shared/utils/check-totals.ts` and use it in:

- `app/stores/draft.ts` `finalize()`
- `app/pages/share/[payload].vue` (legacy)
- `server/api/checks/*`
- tests

`computeTotals(check: SharedCheck): Record<string, number>` must preserve the
current proportional/equal behavior exactly.

`shared/server/validate.ts` (or a function in `check-store.ts`) validates:

- `guests`: array, max 50; ids non-empty strings; names ≤ 100 chars.
- `items`: array, max 200; ids; labels ≤ 200; amounts finite, `>= 0` and
  `<= 1_000_000`; `guestIds` all reference known guests, no duplicates.
- `fees`: array, max 20; ids; labels; amounts.
- `feesMode`: `"proportional" | "equal"`.
- `currencySymbol`: 1–4 chars.
- `name`, `venmoHandle`, `zelleHandle`: optional strings, length caps.
- Reject unknown top-level `share`/metadata fields so a client bug cannot
  persist an edit token in the shared document.

Do not accept client-supplied totals.

## 6. Expiry and tombstone lifecycle

```text
create/renew ──► active ──(expiresAt <= now)──► expired tombstone ──(30d)──► deleted
                    │
                    └──(DELETE)──► revoked tombstone ──(30d)──► deleted
```

- `expiresAt` is set on create and on every successful `PATCH` (sliding 7
  days). `GET` does not extend it.
- On expiry, the active document is replaced with a tombstone. This deletes
  the shared check, totals, handles, and `editTokenHash`.
- Tombstones carry no PII. They exist only to return `410` and prevent an ID
  from silently becoming “not found” immediately.
- Tombstone retention: 30 days by default. After that, cleanup deletes it;
  the old URL becomes `404`.
- There is no renewal endpoint. Re-sharing creates a new `shareId`; the old ID
  is never reused.
- No 7-day physical-deletion promise. Copy should say “shared links expire
  after 7 days of inactivity,” not “data is deleted after exactly 7 days.”

## 7. Cleanup

Two layers:

### Delete-on-read

`GET /api/checks/:id` converts an expired active document to a tombstone
before returning `410`. This handles links people actually open.

### Daily scheduled function

`netlify/functions/cleanup-expired.mts`:

```ts
export const config = { schedule: "0 3 * * *" };
```

Behavior:

1. `list({ prefix: "checks/" })`, paginating if needed.
2. For each active document with `expiresAt <= now`, overwrite with an
   `expired` tombstone.
3. For each tombstone older than 30 days, `delete(key)`.
4. Log only counts (`scanned`, `expired`, `deleted`), never IDs or content.

Constraints:

- Netlify scheduled functions have a 30-second execution limit. At this
  scale, one list pass is enough. If the list grows, process at most N entries
  per run and continue the next day.
- Writes are idempotent; concurrent runs are harmless.
- Use the same `shared/server/check-store.ts` helpers as the API routes.
- No separate cron service, no external scheduler.

## 8. Client owner flow

### Local state

`Check.share` stores:

```ts
{
  shareId: string;
  editToken: string;
  expiresAt: number;
  version: number;
  sharedWithPayment: boolean;
  pendingSync?: boolean;
}
```

The owner’s local check remains the source of truth. The server is a
projection for recipients.

### Create share

`useShareCheck().share(check)`:

1. If `check.share` exists and `expiresAt > now`, reuse its URL.
2. If `check.share` exists but is expired:
   - if `share.sharedWithPayment` is true or a local handle exists, open the
     payment prompt;
   - `POST /api/checks` with a new ID;
   - store the new `share` metadata (including
     `sharedWithPayment: includePayment && handlePresent`) and share the new
     URL.
3. If no share exists, `POST /api/checks` with `includePayment: true` and
   record `sharedWithPayment` from the local handles.
4. Build `${window.location.origin}/s/${shareId}`.
5. Use `navigator.share` or clipboard, same as today.
6. On success, toast “Share link copied” / native share.

QR generation uses the same short URL. The legacy “check is too large to
share” path no longer applies to new shares; it remains only for legacy payload
links.

### Patch on edit

`useSplitFlow.finalize()`:

1. `draft.finalize()` saves the local check.
2. If the check has an active `share`, call `syncSharedCheck(check)`.
3. Do not block navigation on the network request.

`syncSharedCheck`:

- `PATCH /api/checks/:id` with `check` stripped of `share`, the edit token, and
  the last known version.
- On `200`: update `share.version` and `share.expiresAt` locally.
- On `410`: mark the share expired (keep `shareId` for UI/debug), show the
  “link expired” state.
- On network error: set `share.pendingSync = true`.
- On `409`: refetch the current version and retry once; single-owner editing
  makes a real conflict unlikely.
- On `403`: the token is invalid; mark the share as unusable and require a new
  link.

Retry `pendingSync`:

- when the check page mounts;
- when the browser fires `online`;
- when the owner presses Share again.

### Expired re-share prompt

Trigger only when:

- the local check has a `share` with `expiresAt <= now` or a server `410`; and
- `share.sharedWithPayment` is true **or** `venmoHandle`/`zelleHandle` is
  non-empty locally.

`sharedWithPayment` is recorded on the local `ShareRef` when a share is
created. This preserves the “previously had payment info” signal even if the
owner later clears the handles locally.

Modal state is owned by the check page or `useCheckShare`:

```ts
{
  open: boolean;
  includePayment: boolean; // default true if a handle exists
  venmoHandle: string;
  zelleHandle: string;
}
```

On confirm:

- persist any edited handles to the local check;
- `POST /api/checks` with `includePayment` (strip handles server-side when
  false);
- replace `check.share` with the new metadata;
- share the new URL;
- leave the old tombstone untouched.

If neither handle exists, re-share immediately with a new ID and no modal.

### Check deletion

When the owner deletes a local check with an active share:

- best-effort `DELETE /api/checks/:id` with the edit token;
- delete the local check regardless of network result;
- if offline, the server copy expires naturally.

## 9. Recipient flow

`/s/[shareId]`:

1. Fetch `GET /api/checks/:id`.
2. `200` → render the read-only check view.
3. `410` → expired/revoked message.
4. `404` → not-found message.
5. Network failure → offline error with retry.
6. **Never** call `checkStore.add`, `putCheck`, or write to IndexedDB.
7. Do not persist the response in Pinia beyond the current page lifetime.

Refactor the presentation out of `app/pages/checks/[id].vue` into a shared
component (e.g. `app/components/CheckView.vue`) so the owner page and the
recipient page render the same totals/items/guest breakdown/payment UI.

The recipient view has no Edit, Share, or QR actions. Payment buttons remain.

### Service worker

- Add a runtime rule that forces `/api/**` to `NetworkOnly`.
- Do not add shared-check responses to any Workbox cache.
- `/s/:id` may serve the app shell from `navigateFallback` when offline, but
  the data fetch will fail and must show the offline error. No cached check
  content is acceptable.

## 10. OCR

### Server path

`server/api/ocr.post.ts`:

- `readMultipartFormData`; enforce one image and a 4 MB cap.
- Convert to base64 and call Gemini via `@google/genai`.
- Use Netlify AI Gateway env vars (`GEMINI_API_KEY`,
  `GOOGLE_GEMINI_BASE_URL`) so no provider key is stored in the repo.
- Model: `gemini-3.5-flash-lite` with
  `responseMimeType: "application/json"` and a response schema.
- Ask for `{ items: [{ label, amount }], fees: [{ label, amount }] }`.
- Validate and normalize the result (finite amounts, non-empty labels, drop
  zero/blank rows, cap item count).
- Compute confidence using the existing “sum ≈ printed total” tolerance if a
  total is available; otherwise return `"high"`.
- Discard the image buffer.
- Never log the image, base64, OCR text, merchant, handles, or item labels.

Timeout/abort around 25 seconds; the Netlify function limit is 60 seconds.

### Client orchestration

New `useReceiptScan`:

1. Crop/resize as today.
2. If `navigator.onLine` is false → on-device immediately.
3. If the user chose “Scan on this device” → on-device.
4. Otherwise `POST /api/ocr`.
5. On `2xx` → `replaceFromScan(result)`.
6. On network error, `5xx`, or timeout → run the existing `useReceiptOcr`
   fallback and show a notice.
7. On `4xx` (bad image/too large) → show an error; do not silently fall back.

Keep the existing local OCR worker, model assets, and parser unchanged. They
are the fallback and the explicit privacy path.

### Privacy copy

- Server default: “Receipt photos are sent to our server and Google Gemini for
  scanning. Images are not stored.”
- On-device option: “Scanned on this device — the photo never leaves your
  phone.”
- Fallback notice: “Couldn’t reach the server — scanned on this device.”

## 11. Security and abuse

- **Read capability:** 16-char base64url `shareId` (~96 bits). Do not use
  short sequential IDs.
- **Write capability:** 32-byte `editToken`, returned once, stored only in
  local IndexedDB. Store only its SHA-256 hash server-side. Compare with
  `crypto.timingSafeEqual`.
- **Never put the edit token in a URL, query string, analytics event, or log.**
- Strip `share` from any client body before sending; reject unknown metadata
  server-side.
- **Rate limits:**
  - `POST /api/ocr`: strict per-IP limit (e.g. Netlify Firewall rule).
  - `POST /api/checks`: creation limit.
  - `GET`: broad limit; count 404s to deter enumeration.
- **Body limits:** shared check ≤ 64 KB; OCR image ≤ 4 MB.
- **Logging:** no request bodies, no OCR text, no check data. Remove the
  existing `[CHECK_RECEIPT]` console log in `checks/[id].vue` and any raw OCR
  line logging in the local pipeline.
- **Caching:** `no-store` on all check/OCR responses; no recipient IDB.
- **Headers:** `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy:
  no-referrer`.
- **AI spend cap:** set a provider/account cap; Netlify’s credit hard limit is
  a backstop on Free.

## 12. Deployment and local development

- Add dependencies: `@netlify/blobs`, `@google/genai`.
- `nitro.preset: "netlify"` already builds the server. Verify a
  `server/api/health.get.ts` route deploys before building the rest.
- `ssr: false` disables page SSR but does not remove Nitro API routes.
- Netlify AI Gateway activates after at least one production deploy. For local
  work, either use AI Gateway env vars or set `GEMINI_API_KEY`.
- Netlify Blobs needs Netlify context. Use `netlify dev` for end-to-end local
  API work; `nuxt dev` is still fine for client-only work. For unit tests,
  inject a small in-memory store instead of calling Blobs.
- **Deployment ownership (decided):** Netlify's Git integration builds with
  `bun run build` (configured in `netlify.toml`) and publishes
  `.output/public`. The old `.github/workflows/web-deploy.yml` (GitHub Pages
  via `bun run generate`) is removed. There is no GitHub Actions deploy and
  no CI workflow.
- **`bun run build` does not mean SSR.** `ssr: false` is what keeps the app a
  client-rendered SPA/PWA. `nuxt build` produces the static client assets plus
  a Nitro server used only for `server/api/*` and platform functions. Netlify
  serves pages from `.output/public` and routes `/api/*` to the function.
- **Static-only alternative:** if you want to keep `bun run generate`, deploy
  the static client and write standalone functions in `netlify/functions/`
  instead of `server/api/`. Netlify runs both alongside each other. This keeps
  the build purely static but loses `server/api` auto-imports and the shared
  Nitro server helpers; the scheduled cleanup function already lives in
  `netlify/functions`.
- Do **not** use `bun run generate` for the `server/api` variant: it produces a
  static site without runtime API routes.
- If the GitHub Pages workflow is repurposed, remove its `/fiftyfifty/`
  baseURL and Pages permissions/actions; Netlify serves from `/`.
- Netlify Blobs is enabled by using it from a Netlify Function; there is no
  dashboard toggle. Only `@netlify/blobs` and a valid Netlify runtime context
  are required. `NETLIFY_AUTH_TOKEN` is a CI/deploy secret, never a client
  secret.
- Netlify’s Bun detection docs reference `bun.lockb`; this repo uses
  `bun.lock`. Pin `BUN_VERSION` and/or set the build/install command
  explicitly if the default detection is unclear.
- Add `netlify/functions/cleanup-expired.mts`; Netlify auto-detects the
  functions directory. Keep shared helpers in `shared/server/` so both Nitro
  and the scheduled function can import them.
- Add `routeRules` for `/api/**` in `nuxt.config.ts`:
  ```ts
  "/api/**": {
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  },
  ```
- Add a Workbox `NetworkOnly` runtime rule for `/api/**`.

## 13. Backward compatibility

- Keep `app/pages/share/[payload].vue` and `decodeCheck` for existing links.
  Legacy links remain self-contained snapshots and may still save a local
  copy, as they do today.
- New shares always use `/s/<shareId>`.
- `encodeCheck` / `buildShareUrl` remain for legacy decoding/tests, but the
  new share path must not call `encodeCheck`.
- Local checks without `share` behave exactly as today.
- No IndexedDB schema bump is required for the optional `share` field. Bump
  `DB_VERSION` only if a new object store is introduced (it is not planned).

## 14. Verification

Unit:

- `computeTotals` matches current proportional/equal behavior.
- `parseSharedCheck` rejects malformed data and unknown metadata.
- `shareId` length/entropy; `editToken` hashing/compare.
- Expiry: create/patch slide, GET does not; expired → tombstone; tombstone
  cleanup.

Integration with fake store:

- create → get → patch → get
- bad token → 403
- stale version → 409
- expired → 410 + tombstone with no check/PII
- deleted tombstone → 404
- cleanup converts expired active docs and removes old tombstones

Manual (Netlify dev + three browsers/devices):

- Owner shares; recipient opens `/s/:id`; recipient IndexedDB has no check.
- Owner edits; recipient refreshes and sees new totals.
- Recipient never sees Edit/Share/QR.
- Offline owner edit → local save + pending sync; online retry patches.
- Expired link → 410 message; owner sees expired banner.
- Re-share with handles → prompt; new URL works; old URL stays 410.
- Server OCR: image not present in Blobs; network response has no image;
  fallback works with server blocked.
- Service worker does not serve a cached shared check.
