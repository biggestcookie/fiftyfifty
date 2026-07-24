# FiftyFifty — Effortless check splitting

FiftyFifty is a mobile-first, client-side Progressive Web App (PWA) that makes splitting checks quick and private. No accounts, no sign-ins, and no server-side tracking — just a fast, installable app that runs entirely in your browser.

Key benefits

- Fast setup: Get a split in seconds with a touch-first interface.
- Mobile-first: Designed for small screens and one-handed use.
- Offline-capable: Works without a network after the initial load.
- Privacy-first: All data stays on the device; nothing is sent to a server.
- Installable: Add to the home screen for an app-like experience.

Privacy & security

- Client-only architecture: calculations and storage are local (IndexedDB/localStorage). No backend or persisted cloud storage.
- No telemetry or accounts: the app does not collect personal data.
- Explicit sharing only: sharing uses the device's native share/copy features and requires user action.

Install & offline

- Includes a web manifest and service worker for installability and asset caching.
- Core UI and previously created bills remain available offline after first load.

Support & contribution

- Report bugs and request features via the project's GitHub repository — see issues and contribution guidelines in this repo's root.

Technical notes

- Framework: Nuxt (Nuxt UI starter template).
- Package manager: bun. Node >=18 recommended.
- Storage: IndexedDB (preferred) with localStorage for ephemeral UI state.
- PWA: service worker for app shell caching and a web manifest for install behavior.
- Scripts (see package.json): dev (bun run dev), build (bun run build), preview (bun run preview).

Developer guidance

- This project is intentionally client-only. Avoid adding server-side telemetry or user-tracking unless the architecture and docs are updated accordingly.
- Prefer IndexedDB for structured bill data and plan for migrations on schema changes.

More developer details

See [agents.md](/home/bigcookie/projects/fiftyfifty/agents.md) for a concise developer-facing summary and pointers to key files.
