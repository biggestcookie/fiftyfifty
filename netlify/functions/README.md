# Netlify Functions

Scheduled and standalone Netlify Functions live here. The Nitro API routes in
`server/api/` are emitted separately by the Nuxt Netlify preset
(`.netlify/functions-internal`).

## `cleanup-expired`

Runs daily at **03:00 UTC** (`config.schedule = "0 3 * * *"`). Each pass:

1. lists documents under the `checks/` prefix (paginated);
2. replaces active documents whose `expiresAt` has passed with PII-free
   `expired` tombstones;
3. deletes tombstones older than 30 days.

Writes use the ETag read with each document, so the pass is idempotent and safe
to run alongside the API. It stops starting new work after ~20 seconds to stay
under the 30-second scheduled-function limit. Logs contain counts only:

```text
cleanup-expired scanned=12 expired=2 deleted=1 deadline_reached=false
```

### Run it locally

Scheduled functions never fire locally; invoke the handler once instead. The
Netlify CLI must run under **Node**, not Bun.

```bash
npx netlify dev
# in another terminal:
npx netlify functions:invoke cleanup-expired
```

This requires the Netlify Blobs context injected by `netlify dev`; plain
`nuxt dev` cannot run the job.

### Run it in production

Use **Functions → cleanup-expired → Run now** in the Netlify UI. Scheduled
functions are not reachable by URL, and they only fire automatically on the
published production deploy (not on previews or branch deploys).

### Tests

The cleanup pass is covered against an in-memory Blobs store:

```bash
bun test test/cleanup.test.ts
```
