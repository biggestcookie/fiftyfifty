# [FiftyFifty](https://splitfiftyfifty.netlify.app)

A no-hassle, streamlined check-splitting calculator. Mobile-first, installable,
and offline-capable for local checks. Shared links and receipt scanning are
optional server-backed features.

No marketing fluff. Nothing to sell.

## Features

- Local-first. Checks are calculated and saved in IndexedDB on the device.
- No accounts, telemetry, or tracking.
- Optional shared links: share a live read-only copy for friends. Links expire
  **7 days after the last edit**; the edit token stays on the owner's device.
- Recipients read the live server copy. They keep only a small, non-PII
  preview in Recent checks, never a full local check.
- Receipt scanning is server-first through Google Gemini, with on-device
  PaddleOCR as a fallback and an explicit “Scan without uploading” option.
- Sharing and server scanning always require an explicit user action.

## Privacy and retention

- **Receipt images:** sent to our server and Google Gemini only when the user
  chooses server scanning. Images are processed in memory and never stored in
  Blobs, logs, or telemetry. The on-device option keeps the photo on the phone.
- **Shared checks:** stored in Netlify Blobs. Active data expires 7 days after
  creation or the last edit. Expired/revoked records become PII-free tombstones
  and are deleted after 30 days by a daily cleanup job.
- **Recipient previews:** the `sharedChecks` IndexedDB store keeps only the
  share ID, check name, total, item labels, guest count, currency symbol, and
  timestamps. Guest names, guest IDs, payment handles, assignments, and the
  full check are never cached.
- **API responses:** `no-store`, `noindex`, and `no-referrer`. The service
  worker forces `/api/**` to `NetworkOnly`.
- **Logs:** no request bodies, check content, edit tokens, or OCR text.

## Technical notes

- The app is not client-only anymore: shared links and OCR use Nitro API routes
  deployed as Netlify Functions, Netlify Blobs, and a scheduled cleanup
  function. Local checks remain fully client-side.
- Do not add server-side telemetry or tracking.
- Never persist receipt images or OCR text.
- Prefer IndexedDB for structured local data. Plan migrations on schema
  changes.
- See [agents.md](./agents.md) for developer-facing invariants and conventions.

### Stack

- Framework: Vue + Nuxt (Nuxt UI).
- Package manager: bun. Node >=18 recommended.
- Scripts: dev (`bun run dev`), build (`bun run build`), preview
  (`bun run preview`), tests (`bun test`), typecheck (`bun run typecheck`).
- Storage: IndexedDB (preferred) with localStorage for ephemeral UI state;
  Netlify Blobs for shared checks.
- PWA: service worker for app shell caching, web manifest for install behavior.
- Server: Nitro routes (`server/api/`), shared server helpers
  (`shared/server/`), Netlify scheduled cleanup (`netlify/functions/`).
- OCR: Gemini structured output on the server; PaddleOCR in a worker on-device.

### Environment

Server OCR uses either:

- a user-provided `GEMINI_API_KEY` (calls Google directly), or
- Netlify AI Gateway’s injected `GEMINI_API_KEY` /
  `GOOGLE_GEMINI_BASE_URL`.

Never expose these values to the client bundle.

### Install & offline

- Web manifest + service worker for installability and asset caching.
- App shell and previously created local checks are available offline.
- Shared checks need the network; the recipient page shows an offline error
  instead of rendering cached check content.

## Pages

### Homepage (`/`)

- Small hero with description.
- Primary button: create new check.
- Recent local and shared checks below.

### Split flow (`/split/`)

Three-step subflow for a new check.

**Step 1 — Guests (`/split/guests`)**

- Enter number of guests (primary input).
- Optionally label each guest.

**Step 2 — Check (`/split/items`)**

- Enter line items.
- Optional receipt scan: crop first, then server scan, with on-device
  fallback.
- Enter tax and tip at the bottom.

**Step 3 — Assign (`/split/receipt`)**

- Each item has a checkbox per guest for who is splitting it.
- Quick "all" button per item to select all guests.

### Check viewer (`/checks/[id]`)

Hotlinkable final view of a saved local check.

- Top: per-guest totals (who owes what).
- Each guest is a clickable box that expands into a breakdown showing:
  - Items that person is on.
  - Their share of tax and tip.

### Shared check viewer (`/s/[shareId]`)

Read-only view of the live server copy. Opens the payment buttons but no edit,
share, or QR controls. Expired and revoked links show a clear message; the
recipient's Recent checks entry remains with “Link expired” until removed.

### Legacy share (`/share/[payload]`)

Self-contained links from older versions still decode and save locally.

## API

See [server/README.md](./server/README.md) and
[server/api/README.md](./server/api/README.md).
