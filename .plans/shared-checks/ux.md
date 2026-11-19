# Shared Checks — UX Deep Dive

## Share button states

The check page keeps the existing **Share** and **QR** buttons. Their behavior
depends on the local `share` metadata.

| State | Condition | Share action | UI |
| --- | --- | --- | --- |
| Not shared | No `check.share` | Create a new server share | “Share link copied” / native share |
| Active | `expiresAt > now` | Reuse the existing URL | “Shared link · expires in N days” |
| Pending sync | `share.pendingSync` | Retry patch, then copy | Small “Waiting to sync” note |
| Expired | `expiresAt <= now` or server `410` | Create a new share (new ID) | Warning alert + “Share again” |
| Token lost | `403` on patch | Cannot update; create a new share | “This link can’t be updated. Create a new one.” |

Active share status line below the action row:

> “Shared link active · expires in 6 days”

Use a quiet `UBadge` (`color="neutral"`, `variant="soft"`) or a small
`text-sm text-neutral-500` line. Do not block the page.

Expired state:

> **Shared link expired**
> Your local copy is safe. Share again to create a new link.
> [Share again]

Rendered as a yellow `UAlert` (`color="warning"`, `variant="soft"`) above the
action row. The old link is not reused.

## First share

1. Owner taps **Share**.
2. `POST /api/checks` runs.
3. On success, store `shareId`/`editToken`/`expiresAt`/`version` in the local
   check.
4. Open the native share sheet with `/s/<shareId>`; if unavailable, copy the
   URL and toast:
   - “Share link copied”
   - “Paste it anywhere to share this check.”
5. If creation fails, keep the local check and show:
   - “Couldn’t create a share link. Your check is saved locally. Try again.”

The QR button uses the same short URL. There is no “check is too large” error
for new shares; that path remains only for legacy payload links.

## Editing a shared check

1. Owner taps **Edit check**.
2. Edits locally through the existing split flow.
3. Finalizing saves the local check first.
4. The server patch runs in the background.
5. No blocking spinner during normal navigation.

If the patch is pending/offline, show on the check page:

> “Saved on this device. The shared link will update when you’re back online.”

If the patch returns `410`:

> “The shared link expired before this edit could sync. Your local copy is
> safe. Share again to create a new link.”

Do not overwrite local edits with server data. The owner’s local copy wins.

## Expired re-share payment prompt

Show this only when **all** are true:

- the previous share is expired (local `expiresAt` or server `410`);
- the previous share recorded `sharedWithPayment`, or the local check
  currently has a Venmo/Zelle handle.

### Copy

**Title:** “Include payment details in the new link?”

**Body:**
> Your previous shared link expired. Would you like to include your Venmo or
> Zelle details in the new link?

**Fields:**
- Venmo — prefilled from the local check, optional
- Zelle — prefilled from the local check, optional

**Primary:** “Create new link”
**Secondary:** “Share without payment details”
**Dismiss:** “Cancel”

Behavior:

- Edited handles are saved to the local check on confirm.
- “Share without payment details” sends `includePayment: false`; local handles
  are left untouched.
- “Cancel” does nothing.
- If both handles are empty, skip the modal entirely and create a new link.
- Re-sharing always generates a new `shareId`; the old URL remains expired.
- Do not show this prompt on the first-ever share.

### Why only on expired re-share

The first share already has the handles the owner entered. After expiry, the
owner is creating a fresh link, so it is a natural moment to confirm whether
PII should be included again.

## Recipient view

Page: `/s/<shareId>`.

- Read-only rendering of the check: total, receipt entries, guest breakdowns,
  Venmo/Zelle payment actions.
- No **Edit check**, **Share**, or **QR** buttons.
- A small non-PII preview (name, total, item labels, guest count, expiry) is
  saved locally so the check appears in Recent checks. Guest names, payment
  handles, guest assignments, and the full check are not stored.
- Opening the recent entry always re-fetches the live server copy; no cached
  check body is rendered.
- Refreshing the page re-fetches the server copy.

### Loading

Use the existing loading treatment, e.g.:

> “Opening shared check…”

Optionally a skeleton card. Avoid flashing an error during the first fetch.

### Expired (410)

> **This shared check expired**
> Ask your host to share it again.

Include a “Go home” button. Do not show cached check data.

### Not found (404)

> **Couldn’t find this check!**
> Ask your host to share it again.

Include a “Go home” button.

### Revoked (410)

> **This shared check is no longer available**
> Ask your host if they still want to share it.

### Offline / network failure

> **Couldn’t load this shared check**
> Check your connection and try again.
> [Retry]

No cached fallback for the check itself. The local recent preview is display
metadata only and is never rendered as a check when the server is unreachable.

### Malformed / invalid link

If the route has no ID or an invalid shape, show the not-found message rather
than a blank page.

## Owner check deletion

When deleting a local check that has an active share, confirm:

> “This will remove the check from this device and stop the shared link.”

- Best-effort revoke on the server.
- Delete locally even if offline.
- If offline, the server copy expires on its own.

If the owner only wants to stop sharing but keep the local check, use the
future “Stop sharing” action (optional follow-up), not deletion.

## Receipt scanning

The scan menu in `items.vue` keeps “Take photo” and “Choose from library” and
adds:

- **Scan on this device** — uses the existing PaddleOCR worker; no upload.

Default path is the server.

### Server scan states

| State | UI |
| --- | --- |
| Uploading | “Uploading receipt…” (`role="status"`) |
| Reading | “Reading receipt…” |
| Success | Existing success/low-confidence notice |
| Fallback | “Couldn’t reach the server — scanned on this device.” |
| Invalid image | “That image couldn’t be read. Try another photo or enter items manually.” |
| Too large | “That photo is too large. Try again or enter items manually.” |
| Offline | On-device fallback starts automatically |

### Privacy copy

Before the first server scan, show a one-time notice or inline helper:

> “Receipt photos are sent to our server and Google Gemini for scanning.
> Images are not stored.”

For the on-device option:

> “Scanned on this device — the photo never leaves your phone.”

When the server fallback runs:

> “Couldn’t reach the server — scanned on this device.”

Do not keep the old blanket “your receipt never leaves your phone” copy on the
default scan path.

### Existing behavior to preserve

- Crop modal and retake flow.
- Replace-confirmation when the draft already has items.
- Undo scan.
- Low-confidence warning and manual-entry affordance.
- Camera-permission denial banner.
- First-run helper text.
- On-device “Preparing scanner…” state when the model is not cached.

## Accessibility

- Share status uses a `UBadge`/text with an accessible label; expiry is not
  conveyed by color alone.
- Expired/404/offline states use `role="alert"` for errors and
  `aria-live="polite"` for loading/status.
- The payment prompt is a `UModal` with labelled inputs and a clear primary
  action.
- Recipient pages keep the existing focus order; no owner-only controls are
  rendered.
- Scan fallback notices are announced via `role="status"`.
- Buttons keep the current minimum 44px touch targets.

## Copy summary

| Situation | Copy |
| --- | --- |
| Share copied | “Share link copied” |
| Active status | “Shared link active · expires in N days” |
| Pending sync | “Saved on this device. The shared link will update when you’re back online.” |
| Expired owner alert | “Shared link expired — your local copy is safe. Share again to create a new link.” |
| Re-share prompt title | “Include payment details in the new link?” |
| Re-share prompt body | “Your previous shared link expired. Would you like to include your Venmo or Zelle details in the new link?” |
| Recipient expired | “This shared check expired. Ask your host to share it again.” |
| Recipient not found | “Couldn’t find this check! Ask your host to share it again.” |
| Recipient offline | “Couldn’t load this shared check. Check your connection and try again.” |
| Server scan privacy | “Receipt photos are sent to our server and Google Gemini for scanning. Images are not stored.” |
| On-device scan | “Scanned on this device — the photo never leaves your phone.” |
| OCR fallback | “Couldn’t reach the server — scanned on this device.” |
