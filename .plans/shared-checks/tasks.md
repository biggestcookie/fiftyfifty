# Shared Checks — Implementation Tasks

## Phase 0 — Prep and deployment check

- [x] Add dependencies: `@netlify/blobs` (11.1.9), `@google/genai` (3.6.1).
- [x] Add `server/api/health.get.ts` returning `{ ok: true }`.
- [x] Confirm the health route deploys with the existing
      `nitro.preset: "netlify"` and `ssr: false`. Verified on the PR deploy
      preview: `/api/health` → `200 {"ok":true}`.
- [x] Add a `server/README` note covering local Blobs/AI Gateway setup and the
      `nuxt dev` limitation (client-only work).
- [ ] Confirm `netlify dev` injects Netlify Blobs context locally. Not yet
      exercised: the Netlify CLI is not installed in the current environment.
      Run the CLI under Node, not Bun (`netlify-cli` crashes under Bun).
- [x] Decide the canonical domain for share URLs: current origin
      (`window.location.origin`). No domain constant needed.
- [ ] Add a Netlify Firewall rate-limit rule for `/api/ocr` and
      `/api/checks` (dashboard or project config). Blocked on those routes
      existing.

## Phase 0.5 — Deployment and GitHub Actions

**Decision: Netlify Git integration owns deployment. GitHub Actions is
removed entirely (no deploy job, no CI).** A push to the production branch
runs `bun run build` and publishes `dist`. There is no double-build
risk because Netlify is the only builder.

- [x] Choose one deployment owner: **Netlify Git integration**.
- [x] Confirm the Netlify build command is `bun run build`, **not**
      `bun run generate` (pinned in `netlify.toml`).
- [x] Confirm `ssr: false` remains in `nuxt.config.ts`.
- [x] Verify the PWA still uses the static SPA shell and that
      `navigateFallback: "200.html"` is still emitted after the first
      `bun run build` deploy. Verified on the deploy preview: `/200.html` → 200.
- [x] Confirm the publish directory is `dist` (`netlify.toml`). The Nitro
      netlify preset emits client assets to `dist/` and the function to
      `.netlify/functions-internal`; `.output/public` does not exist.
- [x] Remove the disabled GitHub Pages workflow; do not replace it with a
      GitHub Actions deploy. No workflows remain.
- [x] Confirm Netlify detects Bun: this repo uses `bun.lock` (not
      `bun.lockb`), so pin `BUN_VERSION = "1.3.14"` in `netlify.toml`.
- [x] Add `netlify.toml` pinning `[build] command = "bun run build"`,
      `publish = "dist"`, the functions directory, and local
      `netlify dev`.
- [x] Do not switch to `bun run generate`.
- The `bun run generate` + standalone-functions variant and the GitHub
  Actions → Netlify CLI variant are **not** used. The Netlify CLI is only
  used locally for `netlify dev` (run under Node; it crashes under Bun).
- [ ] Confirm server routes are included in the Netlify deploy:
  - [x] `server/api/health.get.ts` responds after deploy (deploy preview).
  - [ ] `netlify/functions/cleanup-expired.mts` appears in the deployed
        functions list (blocked on Phase 3).
  - [ ] The scheduled cleanup function can be triggered manually once
        (blocked on Phase 3).
- Netlify Blobs needs **no dashboard toggle or separate enablement**:
  - [x] Add `@netlify/blobs` as a dependency.
  - [x] Call it from a Netlify Function with the injected context (Phase 2).
        Verified on production: create/read/patch/delete all hit Blobs.
  - [x] Document that `netlify dev` provides local Blobs context and
        `nuxt dev` does not (`server/README.md`).
  - [x] Do not add `NETLIFY_AUTH_TOKEN`/site credentials to client code.
  - [ ] For integration tests that hit real Blobs, provide `NETLIFY_SITE_ID` +
        `NETLIFY_AUTH_TOKEN` (or `NETLIFY_BLOBS_CONTEXT`) only in the job that
        runs them; unit tests should use the in-memory store.
- [x] Verify the deployment serves a live API. Verified on the PR deploy
      preview.
- [x] Verify Blobs write/read once Phase 2 calls it; unit tests use the
      in-memory store. Verified in production on 2026-11-18.

### Netlify MCP configuration check (2026-11-18)

- Project `splitfiftyfifty`, site ID
  `e55da5d7-61fe-407e-899d-7e6f8f013e1c`,
  `https://splitfiftyfifty.netlify.app`.
- Latest production deploy is `6afe4751718cf7b3707285c1` on `main`
  (merge commit `2320e74`), `ready`, and includes the Nuxt `server` function.
  The pre-merge deploy `8b9d564` had no functions; `a49cce6` was the old
  `generate` path.
- Site env vars: only `NITRO_PRESET=netlify`. No `GEMINI_API_KEY` yet
  (Phase 7). Team env vars: none.
- Blobs region: `us-east-2`.

### Deploy verification (2026-11-18)

- PR #1 (`feature/shared-checks`) was merged straight into `main` as merge
  commit `2320e74`; the PR is closed.
- Production deploy `6afe4751718cf7b3707285c1`: `ready`, branch `main`,
  commit `2320e74`; `available_functions` includes the Nuxt `server` function.
- `GET /api/health` → `200 {"ok":true}` on production.
- `GET /200.html` → `200`; `GET /` → `200` on production.
- The first preview (`675757f`) failed: `publish` was `.output/public`, but the
  Nitro netlify preset emits client assets to `dist/`. Fixed in `b4d66fa`.

## Phase 1 — Shared types and totals

- [x] Create `shared/types/check.ts` with `Check`, `Draft`, `Guest`, `Item`,
      `Fee`, `Step`, `FeesMode`, `SharedCheck`, and `ShareRef`.
- [x] Convert `app/types/check.ts` to re-export the shared types so existing
      `~/types/check` imports keep working.
- [x] Move `SharedCheckPayload` (or alias `SharedCheck`) into
      `shared/types/check.ts`; update `app/utils/share.ts`.
- [x] Create `shared/utils/check-totals.ts` with `computeTotals(check)`.
- [x] Replace the totals logic in `app/stores/draft.ts` `finalize()` with the
      shared helper; proportional and equal modes now use one implementation.
- [x] Replace the mirrored totals logic in `app/pages/share/[payload].vue`
      with the shared helper.
- [x] Add `bun test` coverage for proportional/equal totals, empty items, and
      zero-subtotal fallback. `test/check-totals.test.ts` passes (6 tests).

## Phase 2 — Server storage and API

- [x] Create `shared/server/check-store.ts`:
  - [x] `CHECKS_PREFIX = "checks/"`
  - [x] `getStore({ name: "fiftyfifty", consistency: "strong" })`
  - [x] `readDocument(id)`, `createDocument(doc)`, `replaceDocument(doc,
        etag)`, `deleteDocument(id)`, `listDocuments()`
  - [x] `toExpiredTombstone(doc)` and `toRevokedTombstone(doc)` helpers
  - [x] No PII in helper logs
- [x] Create `shared/server/validate.ts`:
  - [x] `parseSharedCheck(value)` shape/limit validation
  - [x] Reject `share`, `editToken`, `totals`, and unknown metadata fields
  - [x] Strip optional handles when `includePayment === false`
- [x] Create `shared/server/tokens.ts`:
  - [x] `newShareId()` → 12 random bytes as 16-char base64url
  - [x] `newEditToken()` → 32 random bytes as base64url
  - [x] `hashEditToken(token)` → SHA-256
  - [x] `verifyEditToken(token, hash)` using `timingSafeEqual`
- [x] Create `shared/server/expiry.ts`:
  - [x] `SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000`
  - [x] `TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000`
  - [x] `isExpired(doc, now)`
  - [x] `nextExpiry(now)` (sliding from last edit)
- [x] Create `server/api/checks/index.post.ts`:
  - [x] Validate body; compute totals server-side
  - [x] Generate ID + edit token; hash the token
  - [x] `onlyIfNew` create; retry ID on collision
  - [x] Return `{ shareId, editToken, expiresAt, version }`
- [x] Create `server/api/checks/[id].get.ts`:
  - [x] Strong-consistency read
  - [x] `404` missing, `410` tombstone
  - [x] Expired active → tombstone + `410`
  - [x] `200` returns check + totals + `version`/`updatedAt`/`expiresAt`
  - [x] Never returns `editTokenHash`
- [x] Create `server/api/checks/[id].patch.ts`:
  - [x] Read doc + etag
  - [x] Verify edit token; `403` on failure
  - [x] `410` if expired/tombstone
  - [x] Version check; `409` on mismatch
  - [x] Validate body; recompute totals; strip handles if requested
  - [x] Increment version; set `updatedAt`; slide `expiresAt`
  - [x] `onlyIfMatch` write; `200` metadata
- [x] Create `server/api/checks/[id].delete.ts`:
  - [x] Verify edit token
  - [x] Replace with `revoked` tombstone (no check/PII/hash)
  - [x] `204`; idempotent for already-revoked
- [x] Add `server/api/README` or comments documenting status codes and auth.

## Phase 3 — Cleanup

- [x] Create `netlify/functions/cleanup-expired.mts`:
  - [x] `export const config = { schedule: "0 3 * * *" }`
  - [x] List `checks/` with pagination
  - [x] Convert expired active docs to tombstones
  - [x] Delete tombstones older than `TOMBSTONE_TTL_MS`
  - [x] Log counts only, never IDs/content
  - [x] Keep each run under the 30-second scheduled limit (batch if needed)
- [x] Add an integration test using a fake store for the cleanup pass.
- [x] Add a manual test command/document for invoking cleanup locally.

## Phase 4 — Owner sharing client

- [x] Add `share?: ShareRef` to the `Check` type; include
      `sharedWithPayment` in `ShareRef` and set it on create/re-share.
      (Already defined in Phase 1; confirmed complete.)
- [x] Add `checkStore.updateShare(id, patch)` and `checkStore.clearShare(id)`
      actions that persist to IndexedDB.
- [x] Refactor `app/utils/share.ts`:
  - [x] Keep legacy `encodeCheck`/`decodeCheck`/`buildShareUrl` for old links.
  - [x] Move shared-check types to `shared/types/check.ts`.
  - [x] Add `buildSharedCheckUrl(shareId)` → `${origin}/s/${shareId}`.
- [x] Refactor `app/composables/useShareCheck.ts`:
  - [x] Create a share via `POST /api/checks`
  - [x] Reuse an active share URL without a network call
  - [x] Share/copy the short URL using `navigator.share`/clipboard
  - [x] Remove the new-share “too large” path (legacy only)
- [x] Create `app/composables/useCheckShare.ts`:
  - [x] `isShareActive(check)`, `isShareExpired(check)`
  - [x] `syncSharedCheck(check)` (PATCH + pending/expired handling)
  - [x] `retryPendingSync(check)`
  - [x] `createNewShare(check, { includePayment })`
  - [x] `revokeShare(check)`
- [x] Update `useSplitFlow.finalize()`:
  - [x] Save local check first
  - [x] Fire `syncSharedCheck(check)` without blocking navigation
- [x] Update `app/pages/checks/[id].vue`:
  - [x] Show share status (active with expiry, expired, not shared)
  - [x] Share button creates/reuses/creates-new as appropriate
  - [x] QR uses the short URL; remove payload-length errors for new shares
  - [x] Retry pending sync on mount and on `online`
  - [x] On `410`, show “shared link expired” and preserve local copy
  - [x] Remove the `[CHECK_RECEIPT]` console log
- [x] Update check deletion:
  - [x] Best-effort `DELETE /api/checks/:id` before removing the local check
  - [x] Continue local deletion if offline

## Phase 5 — Expired re-share payment prompt

- [x] Add prompt state to `useCheckShare` or the check page:
  - [x] `open`, `includePayment`, `venmoHandle`, `zelleHandle`
- [x] Trigger only when the share is expired and the local check has a
      Venmo/Zelle handle or the previous share recorded `sharedWithPayment`.
- [x] Prefill from the local check; allow editing.
- [x] On confirm:
  - [x] Persist edited handles locally
  - [x] `POST /api/checks` with `includePayment`
  - [x] Replace local `share` metadata with the new ID/token/expiry and
        `sharedWithPayment: includePayment && handlePresent`
  - [x] Share the new URL
- [x] On “share without payment details”:
  - [x] Send `includePayment: false`; keep local handles untouched
- [x] If no handles exist, skip the prompt and create a new share.
- [x] Old URL must remain expired; assert no reuse of the old `shareId`.

## Phase 6 — Recipient view

- [x] Extract the presentation from `app/pages/checks/[id].vue` into
      `app/components/CheckView.vue`:
  - [x] total card
  - [x] receipt dropdown
  - [x] guest breakdowns
  - [x] payment buttons/modal
  - [x] `readonly`/action slots so the owner page can keep Edit/Share/QR
- [x] Create `app/pages/s/[id].vue`:
  - [x] Fetch `GET /api/checks/:id`
  - [x] Render `CheckView` read-only
  - [x] No `checkStore.add`; only a non-PII recent preview is persisted
        (share ID, name, total, item labels, guest count, currency, expiry)
  - [x] `410` → expired message
  - [x] `404` → not-found message
  - [x] network failure → offline error with retry
  - [x] loading skeleton
- [x] Keep legacy `app/pages/share/[payload].vue` behavior unchanged.
- [x] Ensure recipients never see Edit/Share/QR controls.
- [x] Ensure payment buttons still work for recipients.

## Phase 7 — Server OCR with on-device fallback

- [x] Add `server/api/ocr.post.ts`:
  - [x] Multipart parse; one image; 4 MB cap; content-type allowlist
  - [x] Base64 + Gemini `gemini-3.5-flash-lite`
  - [x] JSON response schema for `{ items, fees }` (model also reports the
        printed total, used only for confidence)
  - [x] Validate/normalize: finite amounts, non-empty labels, drop blanks,
        cap counts
  - [x] Confidence check against printed total when available
  - [x] Abort/timeout around 25s
  - [x] Discard the image; no Blobs write; no content logs
  - [x] `400` invalid image, `502/504` provider failure
- [x] Create `app/composables/useReceiptScan.ts`:
  - [x] Crop/resize as today (upload copy max 1800px JPEG; device keeps crop)
  - [x] Server-first when online and not explicitly on-device
  - [x] On network/5xx/timeout → existing `useReceiptOcr`
  - [x] Expose `source: "server" | "device"` and `fellBack` state
  - [x] Do not fall back on `4xx`
- [x] Update `app/pages/split/components/items.vue`:
  - [x] Use `useReceiptScan` instead of calling `useReceiptOcr` directly
  - [x] Add “Scan on this device” action to the scan menu
  - [x] Show server upload/read status
  - [x] Show fallback notice when applicable
  - [x] Update privacy copy for server vs on-device
  - [x] Preserve existing success, low-confidence, error, undo, and camera
        permission behavior
- [x] Keep the local OCR worker/model assets; do not remove the fallback.
- [x] Remove/guard any raw OCR line logging that can contain PII.

## Phase 8 — Hardening, docs, and verification

- [ ] Add `nuxt.config.ts` route rules for `/api/**`:
      `cache-control: no-store`, `x-robots-tag: noindex, nofollow`,
      `referrer-policy: no-referrer`.
- [ ] Add Workbox runtime `NetworkOnly` for `/api/**`; verify shared checks
      are never served from a cache.
- [ ] Confirm `/s/:id` navigation works with `navigateFallback: "200.html"`.
- [ ] Enforce body-size limits in the API routes (check ≤ 64 KB, image ≤ 4 MB).
- [ ] Add Netlify rate limits and an AI spend cap.
- [ ] Remove PII from console logs (`[CHECK_RECEIPT]`, raw OCR lines).
- [ ] Add tests:
  - [ ] totals parity
  - [ ] validation rejects malformed/unknown fields
  - [ ] token hash/verify
  - [ ] expiry/tombstone transitions
  - [ ] create/get/patch/delete with a fake store
  - [ ] 403/404/409/410 paths
  - [ ] cleanup pass
- [ ] Manual multi-device checks:
  - [ ] owner share → recipient open → recipient IDB has no check
  - [ ] owner edit → recipient refresh sees updates
  - [ ] offline owner edit → local save + pending sync → online retry
  - [ ] expired link → 410; owner banner
  - [ ] re-share with handles → prompt → new URL; old URL stays dead
  - [ ] server OCR → no image in Blobs/logs; fallback works with server down
- [ ] Update `README.md`:
  - [ ] remove “no backend/no cloud” claims
  - [ ] describe server-backed shared links and transient Gemini upload
  - [ ] describe recipient no-cache behavior
- [ ] Update `agents.md`:
  - [ ] architecture now includes Netlify Functions/Blobs + Gemini
  - [ ] PII/retention rules
  - [ ] shared-link and OCR invariants
- [ ] Add a one-time privacy notice before the first server OCR scan.

## Optional follow-ups (not required for v1)

- [ ] Add a “Stop sharing” action separate from deleting the local check.
- [ ] Add server OCR retry with a stronger model for low-confidence results.
- [ ] Slim the PWA install by making OCR model assets runtime-cached instead
      of precached.
- [ ] Add an owner-facing “download my data” export before local deletion.

## Progress log

### 2026-11-18 — Phases 0, 0.5, and 1

- Added `@netlify/blobs` and `@google/genai`; added `server/api/health.get.ts`
  and `server/README.md`.
- Deployment decision: Netlify Git integration only. The disabled GitHub Pages
  workflow was removed and not replaced; there is no GitHub Actions deploy.
  `netlify.toml` pins `bun run build`, `dist`, `BUN_VERSION`, and the
  functions directory.
- `netlify-cli` crashes under Bun (`enableCompileCache` returns null). Use
  Node for local `netlify dev`.
- Shared types live in `shared/types/check.ts`; totals live in
  `shared/utils/check-totals.ts` and are used by `draft.finalize()` and the
  legacy share page. `bun test` passes (6 tests).
- Verified on the PR #1 deploy preview and then production after merging:
  `/api/health` → `200 {"ok":true}`, `/200.html` → `200`, and the `server`
  function is packaged. The first preview failed because `publish` pointed at
  `.output/public`; Nitro's netlify preset emits client assets to `dist/`.
- Merged `feature/shared-checks` into `main` as `2320e74`; PR #1 is closed.
- Not yet verified: `netlify dev` Blobs context and live Blobs read/write.

### 2026-11-18 — Phase 2 (server storage and API)

- Added `shared/server/expiry.ts`, `tokens.ts`, `validate.ts`, and
  `check-store.ts`. The store uses a small `BlobStore` interface so tests can
  inject an in-memory implementation; `defaultCheckStore()` lazily imports
  `@netlify/blobs` with strong consistency.
- Added `POST /api/checks`, `GET/PATCH/DELETE /api/checks/:id`, plus
  `server/utils/api.ts` for the uniform error shape and JSON body parsing.
  `server/api/README.md` documents auth and status codes.
- Create retries ID collisions with `onlyIfNew`; patch/delete use
  `onlyIfMatch` and return `409` on a stale write. Expired reads and deletes
  replace the document with a PII-free tombstone; tombstones return `410`
  (delete is idempotent and returns `204`).
- Added `test/check-store.test.ts` (tokens, expiry, validation, in-memory
  create/read/replace/delete/list, tombstone contents). `bun test` passes:
  18 tests across 2 files.
- Still unverified: real Blobs reads/writes under `netlify dev` or a deploy.
  Route handlers are not yet covered by an h3-level test (Phase 8).

### 2026-11-18 — Phase 3 (cleanup)

- Added `shared/server/cleanup.ts`: one idempotent pass that expires active
  documents, deletes tombstones older than 30 days, and stops after a 20-second
  time budget. Conditional writes use the ETag read with each document.
- Added `netlify/functions/cleanup-expired.mts` with
  `schedule: "0 3 * * *"`. It logs counts only
  (`scanned`, `expired`, `deleted`, `deadline_reached`).
- Added `test/helpers/memory-store.ts` (paginated in-memory Blobs store) and
  `test/cleanup.test.ts`: mixed active/expired/tombstone docs across pages,
  idempotent second pass, and the time-budget stop.
- Documented local `netlify functions:invoke cleanup-expired` and the
  production **Run now** path in `netlify/functions/README.md`.
- `bun test` passes: 21 tests across 3 files.
- Still unverified: the deployed function appearing in the Netlify functions
  list and a real run against Blobs.

### 2026-11-18 — Phase 2/3 deploy verification

- Pushed `c1cebfd` to `main`; the Netlify Git deploy picked it up in about a
  minute.
- Production smoke test against `https://splitfiftyfifty.netlify.app` (test
  link revoked afterwards): create `201`, public read `200` with server totals,
  bad token `403`, stale version `409`, patch `200` → version 2, payment handle
  stripped by `includePayment: false`, delete `204`, read after delete `410`
  (`revoked`).
- `nuxt dev` now proxies `/api/*` to production via `nitro.devProxy`; a live
  share was read through `localhost:3000` successfully.
- Production home page loads with no console errors.
- Still unverified: the scheduled `cleanup-expired` function in the Netlify
  Functions list and a manual **Run now** execution.

### 2026-11-18 — Phase 4 (owner sharing client)

- `useShareCheck` now creates/reuses a server-backed `/s/<shareId>` link,
  persists `ShareRef` (ID + edit token + expiry + version +
  `sharedWithPayment`) in IndexedDB, and keeps the legacy payload path only
  for old `/share/...` links.
- Added `useCheckShare` with active/expired checks, create-new, PATCH sync
  (409 refetch+retry, 410/403 → expired, network → `pendingSync`),
  pending retry, and best-effort revoke.
- `draft.finalize()` preserves `share` across edits, and
  `useSplitFlow.finalize()` saves locally first, then fires the PATCH without
  blocking navigation.
- The check page shows Not shared / active-with-expiry / pending / expired
  status, reuses the short link for QR, retries pending sync on mount and
  `online`, and drops the `[CHECK_RECEIPT]` log. Deleting a recent check
  best-effort revokes the server link first.
- Verified in the browser against the live API through the dev proxy: share
  created (`201`), status shows active for 7 days, QR reuses the link without
  a second POST, `share` survives a finalize, and deleting the local check
  sends `DELETE` (`204`); the server then returns `410 revoked`.
- Full UI edit → PATCH sync wasn't exercised because page/enter animations
  pause in the automation window; share preservation and the PATCH endpoint
  were verified separately.
- `bun test` 21 pass; typecheck and build pass.

### 2026-11-18 — Phase 5 (expired re-share payment prompt)

- Expired shares now open a `UModal` prompt when the local check has a
  Venmo/Zelle handle or the previous share recorded `sharedWithPayment`.
  Venmo/Zelle fields are prefilled and editable; both Share and QR route
  through the prompt.
- `useCheckShare` exposes `needsPaymentPrompt()`; `ensureShare()` accepts
  `includePayment`. Choosing "Create link with payment details" persists the
  edited handles locally and creates the new share with payment details;
  "Share without payment details" sends `includePayment: false` and leaves the
  local handles untouched.
- Verified against the live API by revoking a share and marking the local copy
  expired:
  - without payment: new ID, server copy has no `venmoHandle`, local handle
    kept, `sharedWithPayment: false`, old URL `410`;
  - with payment: edited handle persisted, server copy includes it,
    `sharedWithPayment: true`, another new ID, previous URL `410`.
- No handles and no prior payment flag still creates a link immediately with
  no prompt.
- Typecheck, `bun test` (21), and build pass. Test links were revoked and local
  test checks removed.

### 2026-11-18 — Phase 6 (recipient view)

- Extracted totals, receipt dropdown, guest breakdowns, and the payment
  buttons/modal from the owner page into `app/components/CheckView.vue`.
  Owner-only actions live in the `actions` slot; the return-home link is in the
  `footer` slot, so the recipient page simply omits both.
- Added `app/pages/s/[id].vue`: fetches `GET /api/checks/:id`, renders
  `CheckView`, has loading skeleton, expired/revoked `410`, not-found `404`,
  and offline-with-retry states. It now also caches a non-PII recent preview
  (see the linked-checks entry below).
- Added `createdAt` to the shared-check GET response (falls back to
  `updatedAt` while an older server deploy is live).
- Verified through the live API in the browser: totals ($26), guest breakdowns,
  receipt dropdown, and payment modal (guest selection updates the amount) all
  work; no Edit/Share/QR controls; unknown IDs show the not-found state and
  revoked links show the revoked state. The owner page still renders and
  shares correctly after the extraction.
- Typecheck, targeted ESLint, `bun test` (21), and build pass.

### 2026-11-18 — Linked checks in recipient recents

- Recipients now see shared checks in **Recent checks**. A new `sharedChecks`
  IndexedDB store (DB version 2) holds only a non-PII preview: `shareId`,
  `name`, `total`, item labels, guest count, currency, `createdAt`, and
  `expiresAt`. Guest names, guest IDs, payment handles, guest assignments, and
  the full check are never stored.
- `/s/:id` upserts the preview after a successful load and marks it expired on
  a server `410` without deleting it: expired links stay in Recent checks until
  the recipient removes them. Every recent entry links to `/s/:id`, so opening
  it always re-fetches the live copy and shows the current
  expired/revoked/offline state.
- Recents merges owner and linked checks by creation time. Linked rows show a
  “Shared” badge, drop to “Link expired” once the link is dead, and use
  “Remove” (local preview only) instead of “Delete”.
- Verified in the browser: the stored preview had no guests/handles/full check;
  home listed the linked check next to a local one; a revoked link marked the
  preview expired and recents showed “Link expired”; removing it cleared the
  store without touching the owner's check.
- Typecheck and `bun test` (21) pass.

### 2026-11-18 — Phase 7 (server OCR with on-device fallback)

- Added `server/api/ocr.post.ts`: multipart parse with a single-image, 4 MB,
  JPEG/PNG/WebP allowlist; in-memory base64 to Gemini
  `gemini-3.5-flash-lite`; `responseMimeType: "application/json"` with an
  explicit `responseSchema`; 25s abort; uniform `400/413/502/504` errors. The
  image is never written or logged.
- Confirmed against Netlify/Gemini docs: AI Gateway injects `GEMINI_API_KEY`
  and `GOOGLE_GEMINI_BASE_URL`, which `new GoogleGenAI({})` reads directly;
  `gemini-3.5-flash-lite` supports image input and structured outputs.
- Model contract: `{ items: [{label, amount}], fees: [{label, amount}],
  total? }`. `total` is the printed grand total and is used only to derive
  confidence, never returned. The API returns `{ items, fees, confidence }`,
  exactly `ParsedReceipt`. Normalization lives in
  `server/utils/receipt-ocr.ts` and drops blank/zero/non-finite rows, clamps
  labels, rounds to cents, and caps item/fee counts.
- Confidence mirrors the local parser: `sum(items) + sum(fees)` vs the printed
  total within 5 cents, compared in integer cents to avoid floating-point
  boundary noise. No total → `high`.
- Added `app/composables/useReceiptScan.ts`: cropped blob → resized JPEG upload
  (longest edge 1800px, quality 0.9) → server. Network errors, timeouts, and
  `5xx` fall back to the unchanged `useReceiptOcr` path with the original crop;
  `4xx` shows an error and never rescans. Exposes `status`, `source`,
  `fellBack`, and `error`.
- Updated `items.vue`: crop modal still runs first; the scan menu gains a
  “Scan on this device” checkbox (disabled when local OCR is unsupported);
  button copy switches between server and on-device privacy text; status shows
  “Scanning receipt on our server…”; success/low-confidence notices mention a
  server fallback; the `"receipt ocr: parsed"` PII log is gone.
- Added `test/receipt-ocr-normalize.test.ts` covering normalization,
  malformed model rows, caps, printed totals, and confidence boundaries.
- Typecheck, targeted ESLint, `bun test` (30), and build pass. Not committed.

### 2026-11-19 — Phase 7 deploy check

- Deployed `/api/ocr` (commit `35a667a`). The route is live and enforces the
  image contract (`400` invalid/unsupported, `413` oversized, `no-store`).
- A real production scan currently returns `502` and falls back to on-device
  OCR. Temporary diagnostics showed the deployed function has **neither**
  `GEMINI_API_KEY` nor `GOOGLE_GEMINI_BASE_URL`, so the SDK tries Application
  Default Credentials and fails immediately.
- This is configuration, not code: enable Netlify AI features/AI Gateway for
  the site (or set a Gemini API key in the site env) to activate the server
  path. Until then the server-first design degrades exactly as intended.

### 2026-11-19 — Gemini key + transient 503 retry

- Added a personal `GEMINI_API_KEY` to the Netlify production environment.
  The deployed function now reaches Gemini directly and returns correct
  `{ items, fees, confidence }` results (verified with a synthetic receipt:
  Pizza 20 + Iced Tea 3 + Tax 2 → `high`).
- The remaining failures are Google-side transient `503 UNAVAILABLE` ("model
  is currently experiencing high demand") for `gemini-3.5-flash-lite`.
- `POST /api/ocr` now retries `429`/`503` once after 700ms before returning
  `502`, still inside the 25s abort budget. The client falls back to device
  OCR if both attempts fail.
