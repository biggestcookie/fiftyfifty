# Checks API

Server-backed shared checks. All routes are same-origin JSON; check data is
stored in Netlify Blobs under `checks/<shareId>.json` (store `fiftyfifty`,
strong consistency). The edit token is returned only by `POST /api/checks` and is
stored server-side as a SHA-256 hash.

| Route                    | Auth                                   | Status codes                                          |
| ------------------------ | -------------------------------------- | ----------------------------------------------------- |
| `POST /api/checks`       | none (rate-limited externally)         | `201`, `400`, `413`, `500`                            |
| `GET /api/checks/:id`    | none; `shareId` is the read capability | `200`, `404`, `410`                                   |
| `PATCH /api/checks/:id`  | `Authorization: Bearer <editToken>`    | `200`, `400`, `403`, `404`, `409`, `410`, `413`       |
| `DELETE /api/checks/:id` | `Authorization: Bearer <editToken>`    | `204`, `403`, `404`, `409`, `410` (tombstone = `204`) |

Error shape: `{ "error": { "code": "...", "message": "..." } }`.

- JSON request bodies are capped at **64 KB** (`413 body_too_large`).
- Totals are always computed server-side with `computeTotals()`; client totals
  are ignored.
- Unknown top-level check fields (including `share`, `editToken`, `totals`) are
  rejected with `400`.
- `includePayment: false` stores the check without payment handles.
- Expiry is sliding: `expiresAt` is set on create and on every successful
  patch. `GET` never extends it.
- Expired active documents are replaced with a PII-free tombstone on read and
  by the daily cleanup job; tombstones return `410` until they are deleted.
- No request body, check content, edit token, or hash is logged.

Local Blobs work only under `netlify dev` (see `server/README.md`).
