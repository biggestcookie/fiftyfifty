# [FiftyFifty](https://splitfiftyfifty.netlify.app)

A no-hassle, streamlined check-splitting calculator packaged as a client-only PWA. Mobile-first, offline-capable, installable.
No marketing fluff. Nothing to sell.

## Features

- Client-only. All calculations and storage stay on the device. No backend, no cloud sync.
- No accounts, no telemetry, no tracking.
- Sharing is explicit: native share/copy only, requires user action.
- Storage: IndexedDB for structured check data, localStorage for ephemeral UI state.

## Technical notes

- Intentionally client-only. Do not add server-side telemetry or tracking.
- Prefer IndexedDB for structured check data. Plan migrations on schema changes.
- See [agents.md](/home/bigcookie/projects/fiftyfifty/agents.md) for developer-facing conventions.

### Stack

- Framework: Vue + Nuxt (Nuxt UI).
- Package manager: bun. Node >=18 recommended.
- Scripts: dev (`bun run dev`), build (`bun run build`), preview (`bun run preview`).
- Storage: IndexedDB (preferred) with localStorage for ephemeral UI state.
- PWA: service worker for app shell caching, web manifest for install behavior.

### Install & offline

- Web manifest + service worker for installability and asset caching.
- App shell and previously created checks available offline after first load.

## Pages

### Homepage (`/`)

- Small hero with description.
- Primary button: create new check.
- Recent checks list below.

### Split flow (`/split/`)

Three-step subflow for a new check.

**Step 1 — Guests (`/split/guests`)**

- Enter number of guests (primary input).
- Optionally label each guest.

**Step 2 — Check (`/split/items`)**

- Enter line items.
- Optional button at top: upload receipt to autofill items.
- Enter tax and tip at the bottom.

**Step 3 — Assign (`/split/receipt`)**

- Each item has a checkbox per guest for who is splitting it.
- Quick "all" button per item to select all guests.

### Check viewer (`/checks/[id]`)

Hotlinkable final view of a saved check.

- Top: per-guest totals (who owes what).
- Each guest is a clickable box that expands into a breakdown showing:
  - Items that person is on.
  - Their share of tax and tip.
