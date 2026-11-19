# Shared Checks — Implementation Tasks

## Phase 0 — Prep and deployment check

- [x] Add dependencies: `@netlify/blobs` (11.1.9), `@google/genai` (3.6.1).
- [x] Add `server/api/health.get.ts` returning `{ ok: true }`.
- [ ] Confirm the health route deploys with the existing
      `nitro.preset: "netlify"` and `ssr: false` (first `bun run build`
      deploy).
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
runs `bun run build` and publishes `.output/public`. There is no double-build
risk because Netlify is the only builder.

- [x] Choose one deployment owner: **Netlify Git integration**.
- [x] Confirm the Netlify build command is `bun run build`, **not**
      `bun run generate` (pinned in `netlify.toml`).
- [x] Confirm `ssr: false` remains in `nuxt.config.ts`.
- [ ] Verify the PWA still uses the static SPA shell and that
      `navigateFallback: "200.html"` is still emitted after the first
      `bun run build` deploy. (The current live deploy emitted `200.html`.)
- [x] Confirm the publish directory is `.output/public` (`netlify.toml`).
- [x] Remove the disabled GitHub Pages workflow; do not replace it with a
      GitHub Actions deploy. No workflows remain.
- [x] Confirm Netlify detects Bun: this repo uses `bun.lock` (not
      `bun.lockb`), so pin `BUN_VERSION = "1.3.14"` in `netlify.toml`.
- [x] Add `netlify.toml` pinning `[build] command = "bun run build"`,
      `publish = ".output/public"`, the functions directory, and local
      `netlify dev`.
- [x] Do not switch to `bun run generate`.
- The `bun run generate` + standalone-functions variant and the GitHub
  Actions → Netlify CLI variant are **not** used. The Netlify CLI is only
  used locally for `netlify dev` (run under Node; it crashes under Bun).
- [ ] Confirm server routes are included in the Netlify deploy:
  - [ ] `server/api/health.get.ts` responds after deploy.
  - [ ] `netlify/functions/cleanup-expired.mts` appears in the deployed
        functions list (blocked on Phase 3).
  - [ ] The scheduled cleanup function can be triggered manually once
        (blocked on Phase 3).
- Netlify Blobs needs **no dashboard toggle or separate enablement**:
  - [x] Add `@netlify/blobs` as a dependency.
  - [ ] Call it from a Netlify Function with the injected context (Phase 2).
  - [x] Document that `netlify dev` provides local Blobs context and
        `nuxt dev` does not (`server/README.md`).
  - [x] Do not add `NETLIFY_AUTH_TOKEN`/site credentials to client code.
  - [ ] For integration tests that hit real Blobs, provide `NETLIFY_SITE_ID` +
        `NETLIFY_AUTH_TOKEN` (or `NETLIFY_BLOBS_CONTEXT`) only in the job that
        runs them; unit tests should use the in-memory store.
- [ ] Verify the deployment actually serves a live API and Blobs write/read.
      Blocked on the first `bun run build` deploy; the current live deploy
      contains no functions.

### Netlify MCP configuration check (2026-11-18)

- Project `splitfiftyfifty`, site ID
  `e55da5d7-61fe-407e-899d-7e6f8f013e1c`,
  `https://splitfiftyfifty.netlify.app`.
- Current production deploy `a49cce6` matches HEAD, branch `main`, state
  `ready`.
- That deploy has **no functions** and emitted static pages including
  `200.html`, confirming it was built with the old `generate` path.
- Site env vars: only `NITRO_PRESET=netlify`. No `GEMINI_API_KEY` yet
  (Phase 7). Team env vars: none.
- Blobs region: `us-east-2`.

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

- [ ] Create `shared/server/check-store.ts`:
  - [ ] `CHECKS_PREFIX = "checks/"`
  - [ ] `getStore({ name: "fiftyfifty", consistency: "strong" })`
  - [ ] `readDocument(id)`, `createDocument(doc)`, `replaceDocument(doc,
        etag)`, `deleteDocument(id)`, `listDocuments()`
  - [ ] `toExpiredTombstone(doc)` and `toRevokedTombstone(doc)` helpers
  - [ ] No PII in helper logs
- [ ] Create `shared/server/validate.ts`:
  - [ ] `parseSharedCheck(value)` shape/limit validation
  - [ ] Reject `share`, `editToken`, `totals`, and unknown metadata fields
  - [ ] Strip optional handles when `includePayment === false`
- [ ] Create `shared/server/tokens.ts`:
  - [ ] `newShareId()` → 12 random bytes as 16-char base64url
  - [ ] `newEditToken()` → 32 random bytes as base64url
  - [ ] `hashEditToken(token)` → SHA-256
  - [ ] `verifyEditToken(token, hash)` using `timingSafeEqual`
- [ ] Create `shared/server/expiry.ts`:
  - [ ] `SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000`
  - [ ] `TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000`
  - [ ] `isExpired(doc, now)`
  - [ ] `nextExpiry(now)` (sliding from last edit)
- [ ] Create `server/api/checks/index.post.ts`:
  - [ ] Validate body; compute totals server-side
  - [ ] Generate ID + edit token; hash the token
  - [ ] `onlyIfNew` create; retry ID on collision
  - [ ] Return `{ shareId, editToken, expiresAt, version }`
- [ ] Create `server/api/checks/[id].get.ts`:
  - [ ] Strong-consistency read
  - [ ] `404` missing, `410` tombstone
  - [ ] Expired active → tombstone + `410`
  - [ ] `200` returns check + totals + `version`/`updatedAt`/`expiresAt`
  - [ ] Never returns `editTokenHash`
- [ ] Create `server/api/checks/[id].patch.ts`:
  - [ ] Read doc + etag
  - [ ] Verify edit token; `403` on failure
  - [ ] `410` if expired/tombstone
  - [ ] Version check; `409` on mismatch
  - [ ] Validate body; recompute totals; strip handles if requested
  - [ ] Increment version; set `updatedAt`; slide `expiresAt`
  - [ ] `onlyIfMatch` write; `200` metadata
- [ ] Create `server/api/checks/[id].delete.ts`:
  - [ ] Verify edit token
  - [ ] Replace with `revoked` tombstone (no check/PII/hash)
  - [ ] `204`; idempotent for already-revoked
- [ ] Add `server/api/README` or comments documenting status codes and auth.

## Phase 3 — Cleanup

- [ ] Create `netlify/functions/cleanup-expired.mts`:
  - [ ] `export const config = { schedule: "0 3 * * *" }`
  - [ ] List `checks/` with pagination
  - [ ] Convert expired active docs to tombstones
  - [ ] Delete tombstones older than `TOMBSTONE_TTL_MS`
  - [ ] Log counts only, never IDs/content
  - [ ] Keep each run under the 30-second scheduled limit (batch if needed)
- [ ] Add an integration test using a fake store for the cleanup pass.
- [ ] Add a manual test command/document for invoking cleanup locally.

## Phase 4 — Owner sharing client

- [ ] Add `share?: ShareRef` to the `Check` type; include
      `sharedWithPayment` in `ShareRef` and set it on create/re-share.
- [ ] Add `checkStore.updateShare(id, patch)` and `checkStore.clearShare(id)`
      actions that persist to IndexedDB.
- [ ] Refactor `app/utils/share.ts`:
  - [ ] Keep legacy `encodeCheck`/`decodeCheck`/`buildShareUrl` for old links.
  - [ ] Move shared-check types to `shared/types/check.ts`.
  - [ ] Add `buildSharedCheckUrl(shareId)` → `${origin}/s/${shareId}`.
- [ ] Refactor `app/composables/useShareCheck.ts`:
  - [ ] Create a share via `POST /api/checks`
  - [ ] Reuse an active share URL without a network call
  - [ ] Share/copy the short URL using `navigator.share`/clipboard
  - [ ] Remove the new-share “too large” path (legacy only)
- [ ] Create `app/composables/useCheckShare.ts`:
  - [ ] `isShareActive(check)`, `isShareExpired(check)`
  - [ ] `syncSharedCheck(check)` (PATCH + pending/expired handling)
  - [ ] `retryPendingSync(check)`
  - [ ] `createNewShare(check, { includePayment })`
  - [ ] `revokeShare(check)`
- [ ] Update `useSplitFlow.finalize()`:
  - [ ] Save local check first
  - [ ] Fire `syncSharedCheck(check)` without blocking navigation
- [ ] Update `app/pages/checks/[id].vue`:
  - [ ] Show share status (active with expiry, expired, not shared)
  - [ ] Share button creates/reuses/creates-new as appropriate
  - [ ] QR uses the short URL; remove payload-length errors for new shares
  - [ ] Retry pending sync on mount and on `online`
  - [ ] On `410`, show “shared link expired” and preserve local copy
  - [ ] Remove the `[CHECK_RECEIPT]` console log
- [ ] Update check deletion:
  - [ ] Best-effort `DELETE /api/checks/:id` before removing the local check
  - [ ] Continue local deletion if offline

## Phase 5 — Expired re-share payment prompt

- [ ] Add prompt state to `useCheckShare` or the check page:
  - [ ] `open`, `includePayment`, `venmoHandle`, `zelleHandle`
- [ ] Trigger only when the share is expired and the local check has a
      Venmo/Zelle handle or the previous share recorded `sharedWithPayment`.
- [ ] Prefill from the local check; allow editing.
- [ ] On confirm:
  - [ ] Persist edited handles locally
  - [ ] `POST /api/checks` with `includePayment`
  - [ ] Replace local `share` metadata with the new ID/token/expiry and
        `sharedWithPayment: includePayment && handlePresent`
  - [ ] Share the new URL
- [ ] On “share without payment details”:
  - [ ] Send `includePayment: false`; keep local handles untouched
- [ ] If no handles exist, skip the prompt and create a new share.
- [ ] Old URL must remain expired; assert no reuse of the old `shareId`.

## Phase 6 — Recipient view

- [ ] Extract the presentation from `app/pages/checks/[id].vue` into
      `app/components/CheckView.vue`:
  - [ ] total card
  - [ ] receipt dropdown
  - [ ] guest breakdowns
  - [ ] payment buttons/modal
  - [ ] `readonly`/action slots so the owner page can keep Edit/Share/QR
- [ ] Create `app/pages/s/[id].vue`:
  - [ ] Fetch `GET /api/checks/:id`
  - [ ] Render `CheckView` read-only
  - [ ] No `checkStore.add`, no IndexedDB write, no local persistence
  - [ ] `410` → expired message
  - [ ] `404` → not-found message
  - [ ] network failure → offline error with retry
  - [ ] loading skeleton
- [ ] Keep legacy `app/pages/share/[payload].vue` behavior unchanged.
- [ ] Ensure recipients never see Edit/Share/QR controls.
- [ ] Ensure payment buttons still work for recipients.

## Phase 7 — Server OCR with on-device fallback

- [ ] Add `server/api/ocr.post.ts`:
  - [ ] Multipart parse; one image; 4 MB cap; content-type allowlist
  - [ ] Base64 + Gemini `gemini-3.5-flash-lite`
  - [ ] JSON response schema for `{ items, fees }`
  - [ ] Validate/normalize: finite amounts, non-empty labels, drop blanks,
        cap counts
  - [ ] Confidence check against printed total when available
  - [ ] Abort/timeout around 25s
  - [ ] Discard the image; no Blobs write; no content logs
  - [ ] `400` invalid image, `502/504` provider failure
- [ ] Create `app/composables/useReceiptScan.ts`:
  - [ ] Crop/resize as today
  - [ ] Server-first when online and not explicitly on-device
  - [ ] On network/5xx/timeout → existing `useReceiptOcr`
  - [ ] Expose `source: "server" | "device"` and `fellBack` state
  - [ ] Do not fall back on `4xx`
- [ ] Update `app/pages/split/components/items.vue`:
  - [ ] Use `useReceiptScan` instead of calling `useReceiptOcr` directly
  - [ ] Add “Scan on this device” action to the scan menu
  - [ ] Show server upload/read status
  - [ ] Show fallback notice when applicable
  - [ ] Update privacy copy for server vs on-device
  - [ ] Preserve existing success, low-confidence, error, undo, and camera
        permission behavior
- [ ] Keep the local OCR worker/model assets; do not remove the fallback.
- [ ] Remove/guard any raw OCR line logging that can contain PII.

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
  `netlify.toml` pins `bun run build`, `.output/public`, `BUN_VERSION`, and the
  functions directory.
- `netlify-cli` crashes under Bun (`enableCompileCache` returns null). Use
  Node for local `netlify dev`.
- Shared types live in `shared/types/check.ts`; totals live in
  `shared/utils/check-totals.ts` and are used by `draft.finalize()` and the
  legacy share page. `bun test` passes (6 tests).
- Not yet verified: `/api/health` deploy, `netlify dev` Blobs context,
  `200.html` emission under `bun run build`, and live Blobs read/write.
  The current live deploy (`a49cce6`) predates these changes, has no functions,
  and was built with `generate`.
