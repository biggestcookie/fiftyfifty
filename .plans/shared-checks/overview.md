# Shared Checks — Overview

## Goal

Replace the self-contained `/share/<payload>` link with a short, server-backed
`/s/<shareId>` link, while keeping the app local-first for owners.

- The **full shared check** is stored server-side (same data the current v2
  share payload carries: guests, items, fees, fees mode, currency, name,
  payment handles, plus computed totals).
- **No receipt images are stored**, ever. OCR runs on the image in memory and
  immediately discards it.
- The owner keeps the local copy in IndexedDB and is the source of truth.
- Recipients read the current server copy. They keep only a small **non-PII
  preview** (share ID, name, total, item labels, guest count, currency,
  expiry) for their recent-checks list, and do not get offline access to the
  check itself.
- Shared state expires **7 days after the last edit** (sliding). There is no
  promise that data is physically deleted exactly at the 7-day mark; deletion
  happens on read and in a daily cleanup.
- Server OCR via Gemini is the default scan path. The existing on-device
  PaddleOCR pipeline remains as a fallback and as an explicit privacy option.

## User-visible behaviour

### Owner

- Pressing **Share** on a check creates a server-backed shared link and shares
  or copies `https://<domain>/s/<shareId>`.
- The check page shows the shared-link status:
  - active, with “expires in N days” based on `expiresAt`
  - expired
  - not shared
- Edits continue to happen in the local draft flow. After finalizing, the local
  check is saved first, then the server copy is patched.
- If a patch fails because the link expired, the local check is unchanged and
  the owner is prompted to share again (creating a new link).
- If a patch fails because the device is offline, the local save still
  succeeds; the share is marked pending and retried when the check page is
  opened again or the device comes online.
- When re-sharing an expired link and the check has a Venmo or Zelle handle,
  show a prompt before creating the new link:
  - “Your previous link expired. Include payment details in the new link?”
  - prefilled Venmo/Zelle fields
  - an option to share without payment details
- Re-sharing **never reuses the old URL**. A new `shareId` is generated. The
  old URL stays expired (410) until its tombstone is cleaned up (then 404).

### Recipient

- Opening `/s/<shareId>` fetches the current server copy and renders a
  read-only check view.
- The recipient can use the Venmo/Zelle payment buttons from the shared check.
- No edit, share, or QR controls.
- Only a non-PII preview is cached locally so the check appears in Recent
  checks. Guest names, guest IDs, payment handles, guest assignments, and the
  full check are never stored. The server is authoritative on every visit;
  opening the entry always re-fetches `/api/checks/:id` and shows the live
  expired/revoked state when relevant.
- Expired link: “This shared check expired. Ask your host to share it again.”
- Unknown link: “Couldn’t find this check! Ask your host to share it again.”
- Offline/unreachable: “Couldn’t load this shared check. Check your connection
  and try again.” There is no cached fallback.

### Receipt scanning

- Default: the cropped image is uploaded to `/api/ocr`, processed by Gemini,
  and the parsed items/fees replace the draft. The image is never persisted.
- Fallback: if the server is unreachable, times out, or returns a server error,
  automatically run the existing on-device OCR pipeline.
- Explicit option: “Scan on this device” in the scan menu, for privacy or
  offline use.
- Privacy copy changes from “never leaves your phone” to distinguish the
  server path from the on-device path.

## Locked decisions

- **Storage:** Netlify Blobs, keyed by `checks/<shareId>.json`.
- **No database:** no Postgres, Firebase, Mongo, or Supabase for this.
- **ID:** 16-character URL-safe random string (~96 bits), generated
  server-side.
- **No auth:** `shareId` is the read capability; a separate 32-byte
  `editToken` is the write capability, stored only on the owner’s device.
- **No URL reuse:** a re-share creates a new `shareId`.
- **Expiry:** sliding 7 days from create or last successful patch.
- **Deployment:** Netlify Git integration owns deploys; no GitHub Actions.
  Keep `ssr: false`; `bun run build` produces the static SPA/PWA plus Netlify
  Functions for the API. Pages are never server-rendered.
- **No hard 7-day deletion promise:** access expires at `expiresAt`; data is
  removed on read and by a daily cleanup.
- **Tombstone:** expired/revoked documents are replaced with a tombstone that
  contains no check data, receipt data, or PII.
- **Recipients:** server-only for check data; a non-PII preview is cached for
  recents, no service-worker API cache.
- **Owner:** local copy is canonical; edits are patched to the server.
- **No PII caching:** recipient previews exclude guest names, guest IDs,
  payment handles, and guest assignments; no API response caching, no logging
  check bodies or raw OCR text.
- **Payment prompt:** only when re-sharing an expired link that has at least
  one Venmo/Zelle handle locally.
- **OCR:** Gemini primary, on-device fallback.

## Non-goals

- Real-time push, polling, WebSockets, or Supabase Realtime. Recipients see
  the latest copy on page load/refresh.
- User accounts, sign-in, or per-user permissions.
- Storing receipt images or thumbnails.
- A server-side list/search endpoint or a receipt dashboard.
- Recipient offline support for shared checks.
- Reusing an expired URL or an expired edit token.
- Multi-owner concurrent editing.
- Reworking the existing local check/split flow beyond the share hooks.

## High-level architecture

```text
Owner device                              Netlify
  ├─ IndexedDB: Check + share metadata     ├─ POST /api/checks
  │    shareId, editToken, expiresAt       │    validate + compute totals
  │                                        │    create Blobs document
  ├─ local edit → save local               ├─ PATCH /api/checks/:id
  └─ patch server (best effort) ──────────►│    verify edit token + version
                                           │    update doc, slide expiresAt
Recipient /s/:id ── GET ──────────────────►│
  └─ read-only + non-PII preview           ├─ GET expired → tombstone, 410
                                           ├─ daily cleanup function
                                           └─ POST /api/ocr → Gemini
                                                (image discarded)
```

## File map

| File | Change | Purpose |
| --- | --- | --- |
| `shared/types/check.ts` | new | Shared `Check`, `SharedCheck`, `ShareRef` types |
| `shared/utils/check-totals.ts` | new | One totals implementation for client + server |
| `shared/server/check-store.ts` | new | Blobs read/write/list/tombstone helpers |
| `server/api/checks/index.post.ts` | new | Create a shared check |
| `server/api/checks/[id].get.ts` | new | Read a shared check; 410/404 handling |
| `server/api/checks/[id].patch.ts` | new | Owner update; sliding expiry |
| `server/api/checks/[id].delete.ts` | new | Revoke a shared link |
| `server/api/ocr.post.ts` | new | Gemini OCR; no persistence |
| `netlify/functions/cleanup-expired.mts` | new | Daily tombstone/cleanup job |
| `app/types/check.ts` | modified | Re-export shared types; add `share` |
| `app/utils/share.ts` | modified | Keep legacy encode/decode; shared types |
| `app/composables/useShareCheck.ts` | modified | Create/copy server share link |
| `app/composables/useCheckShare.ts` | new | Owner status, patch/retry, re-share prompt state |
| `app/composables/useReceiptScan.ts` | new | Server-first OCR with local fallback |
| `app/pages/checks/[id].vue` | modified | Share status, re-share, QR, sync retry |
| `app/pages/s/[id].vue` | new | Read-only server-backed shared check |
| `app/pages/share/[payload].vue` | modified | Legacy route only; use shared totals |
| `app/pages/split/components/items.vue` | modified | Server OCR + fallback UI |
| `app/stores/draft.ts` | modified | Use shared totals helper |
| `app/stores/check.ts` | modified | Persist/update share metadata |
| `nuxt.config.ts` | modified | `/api/**` no-store, PWA NetworkOnly |
| `netlify.toml` | optional/new | Pin build command, publish dir, functions dir |
| `.github/workflows/web-deploy.yml` | removed | No GitHub Actions deploy; Netlify Git integration builds |
| `README.md`, `agents.md` | modified | Update privacy/architecture claims |

## Rollout phases

1. **Server foundation** — shared types/totals, Blobs store, create/get/patch
   routes, expiry/tombstone, cleanup function, a deployed smoke test.
2. **Owner sharing** — `share` metadata on local checks, Share/QR flow, status,
   patch-on-finalize, pending retry.
3. **Recipient view** — `/s/[id]`, read-only check view, non-PII recent preview,
   expired/404 states; keep legacy `/share/[payload]`.
4. **Expired re-share prompt** — Venmo/Zelle confirmation, new ID creation.
5. **Server OCR** — `/api/ocr`, server-first composable, on-device fallback,
   privacy copy.
6. **Hardening** — no PII logs/caches, rate limits, PWA exclusions, docs,
   tests.

## Risks

- **Blobs consistency:** default eventual reads can serve stale data. Use
  strong-consistency reads or the share refresh can lag.
- **Abuse without auth:** `/api/ocr` and `/api/checks` are public. Rate-limit,
  cap body size, cap AI spend.
- **PII leaks:** local owner copy is expected; recipients must not persist.
  Server logs, browser console, and service-worker caches are easy mistakes.
- **Expiry cleanup:** lazy-only cleanup does not guarantee deletion. Daily
  cleanup plus delete-on-read is required for the privacy posture.
- **Nuxt + Netlify Server route deployment:** verify a server route deploys
  with `ssr: false` before building the rest.
- **OCR timeout:** Gemini may exceed the function budget; the fallback must be
  reliable and clearly surfaced.
- **Edit-token loss:** clearing owner storage leaves the link read-only; that
  is the accepted no-auth trade-off.
