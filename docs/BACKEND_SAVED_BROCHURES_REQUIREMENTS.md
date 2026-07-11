# Backend Requirements: Multiple Saved Brochure Copies (MR)

**Date:** 2026-07-10  
**From:** Mobile app team (`medical-app-fresh`)  
**Priority:** High — blocks MR workflow and sync

---

## Product requirement

An MR must be able to download the **same assigned brochure multiple times** from the **Available** tab. Each download becomes an **independent saved copy** in the **Saved** tab:

- Distinct display name (`Fervid`, `Fervid (2)`, …)
- Independent slide edits (add / edit / delete slides, groups)
- Independent rename
- Independent delete

Copies share the same **source** admin brochure (`brochure_id` UUID) but are separate **saved brochure** records.

---

## What the mobile app does now (after fix)

| Layer | Behavior |
|-------|----------|
| Local SQLite | **Multiple rows** allowed per `(mr_id, brochure_id)` — unique constraint removed (migration 007) |
| File storage | Each copy uses its own `storage_id` (= local saved row UUID). Slides live under `brochures/{storage_id}/` |
| Download | Every tap on Download creates a **new** local row + new storage folder |
| Sync push | Each copy queues its own `saved_brochures` **create** operation |
| Activity logs | `brochure_download` and `brochure_saved` events sync correctly (already working) |

---

## Backend changes required

### 1. `SavedBrochure` model — allow duplicates

**Problem:** Django admin shows **0 saved brochures** even after mobile sync, while activity logs show downloads. Likely causes:

- `UniqueConstraint` / `unique_together` on `(mr, brochure)` or `(mr_id, brochure_id)` causing `POST /api/mr/saved-brochures/` to fail or upsert silently
- Sync handler deduplicating by source `brochure_id` instead of creating new rows

**Required:**

```python
# REMOVE any unique constraint on (mr, brochure_id) for SavedBrochure
# Each SavedBrochure row is identified by its own primary key (UUID)
class SavedBrochure(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    mr = models.ForeignKey(User, ...)
    brochure = models.ForeignKey(Brochure, ...)  # source admin brochure — NOT unique per MR
    custom_title = models.CharField(...)
    brochure_title = models.CharField(...)
    original_brochure_data = models.JSONField(...)
    saved_at = models.DateTimeField(...)
    last_accessed = models.DateTimeField(...)
    is_deleted = models.BooleanField(default=False)
```

**API — `POST /api/mr/saved-brochures/`**

Must **always create a new row** when the mobile app sends:

```json
{
  "brochure_id": "3f843e56-58e4-4877-91bd-c8138705fd18",
  "brochure_title": "Fervid",
  "custom_title": "Fervid (2)",
  "original_brochure_data": { ... }
}
```

Response (envelope):

```json
{
  "success": true,
  "data": { "id": "<new-saved-brochure-uuid>" }
}
```

Do **not** return an existing row when the same MR saves the same source brochure again.

**API — `GET /api/mr/saved-brochures/`**

Return **all** non-deleted copies for the MR, including multiple entries with the same `brochure_id`:

```json
{
  "success": true,
  "data": [
    { "id": "aaa-...", "brochure_id": "3f84-...", "custom_title": "Fervid", ... },
    { "id": "bbb-...", "brochure_id": "3f84-...", "custom_title": "Fervid (2)", ... }
  ]
}
```

**API — update / delete**

- `PATCH /api/mr/saved-brochures/{saved_brochure_id}/` — target by **saved brochure id**, not source `brochure_id`
- `DELETE /api/mr/saved-brochures/{saved_brochure_id}/` — delete one copy only

---

### 2. Sync push — `saved_brochures` entity

Mobile sync sends per-copy operations via `POST /api/sync/push/` and direct `syncSavedBrochure` calls.

| Operation | Payload fields | Expected backend action |
|-----------|------------------|-------------------------|
| `create` | `mr_id`, `brochure_id`, `brochure_title`, `custom_title`, `original_brochure_data` | Insert **new** SavedBrochure, return `id` |
| `update` | `server_id`, `custom_title` | Update that saved copy's title |
| `delete` | `server_id`, `brochure_id`, `is_deleted: true` | Soft-delete that saved copy |

**Do not** dedupe creates by `(mr_id, brochure_id)`.

---

### 3. `BrochureSync` — slide edits per copy (phase 2)

**Current gap:** `/api/mr/brochure-sync/` is keyed by source `brochure_id`. If two saved copies exist, slide edits would collide on the server.

**Required (follow-up):**

```python
class BrochureSync(models.Model):
    mr = models.ForeignKey(...)
    brochure = models.ForeignKey(Brochure, ...)           # source brochure
    saved_brochure = models.ForeignKey(SavedBrochure, ...)  # NEW — which copy
    brochure_data = models.JSONField(...)
    last_modified = models.DateTimeField(...)
```

Mobile will send `saved_brochure_id` in brochure-sync payloads once the backend field exists. Until then, **local slide edits work independently**; server sync of slide data may still overwrite between copies.

---

## How to verify (backend)

1. Log in as MR (`valuesinfotech@gmail.com`)
2. `POST /api/mr/saved-brochures/` twice with same `brochure_id`, different `custom_title`
3. Expect **two rows** in Django admin → Saved brochures
4. `GET /api/mr/saved-brochures/` returns both
5. Mobile manual sync → admin count matches device Saved tab

---

## Symptoms we saw (for debugging)

| Symptom | Root cause |
|---------|------------|
| Download twice → only one item in Saved tab | Local UNIQUE + reuse logic overwrote first copy (fixed in app) |
| First copy “vanished”, second titled `(2)` | `createSavedBrochure` updated existing row instead of inserting |
| Activity logs show downloads, admin shows 0 saved | Saved brochure sync create failing or deduped on backend |
| `brochure_saved` missing for 2nd download | Create failed before activity log (fixed with independent inserts) |

---

## Contact

Mobile changes are in:

- `src/services/localDatabaseService.ts` (migration 007, `createSavedBrochure`)
- `src/screens/mr/BrochuresScreen.tsx` (download / view / thumbnails)
- `src/services/SyncService.ts` (sync down matching by `server_id`)

Please confirm when backend allows multiple `SavedBrochure` rows per MR per source brochure so we can run end-to-end sync tests.
