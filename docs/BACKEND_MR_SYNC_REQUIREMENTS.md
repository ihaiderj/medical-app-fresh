# Backend MR Sync Requirements

**Date:** 2026-07-10  
**From:** Mobile app team (`medical-app-fresh`)  
**Purpose:** Define everything an MR creates or modifies that **must be persisted on the server** so the MR can install the app on a new device, log in, and recover all records without data loss.

> **Note:** This document describes what **should** be synced — not what the app currently syncs correctly. Use this as the source of truth for backend implementation and QA.

---

## Table of Contents

1. [Overview](#1-overview)
2. [What Is NOT MR Backup](#2-what-is-not-mr-backup)
3. [Brochures](#3-brochures)
4. [Meetings](#4-meetings)
5. [Doctors](#5-doctors)
6. [Cross-Cutting Requirements](#6-cross-cutting-requirements)
7. [Summary Checklist](#7-summary-checklist)

---

## 1. Overview

On a fresh install + login, the app must be able to **pull down and reconstruct**:

1. All **MR-owned records** (doctors, meetings, notes, saved brochures, brochure edits)
2. All **binary files** those records depend on (photos, slide images, brochure files)
3. All **deletions** (tombstones), so deleted items do not reappear

### Restore order on new device login

Server pull / sync-down should return data in dependency order:

```
1. Doctor profiles + photos
2. Saved brochure copies (metadata)
3. Brochure files + brochure sync data (per saved_brochure_id)
4. MR-uploaded brochures (if any)
5. Meetings
6. Meeting follow-ups
7. Meeting notes (+ slide snapshot images)
8. Activity logs (optional)
```

---

## 2. What Is NOT MR Backup

These are needed on a new device but are **not created by the MR** — they come from admin assignment / global catalog:

| Data | Source | Notes |
|------|--------|-------|
| Admin-assigned brochure catalog | `GET /api/mr/brochures/` | Titles, categories, `file_url`, thumbnails |
| MR account & permissions | Auth profile | `can_upload_brochures`, name, email |
| Admin brochure source files | Server file storage | Original ZIP/PDF the MR downloads from |

Everything in sections 3–5 is **MR-generated** and must be backed up per MR account.

---

## 3. Brochures

### 3.1 Saved Brochure Copy (core record)

**Triggered when MR:** downloads a brochure from the Available tab. Each download creates a **new independent copy** in the Saved tab.

**Server entity:** `SavedBrochure` — one row per copy. **Do not** enforce uniqueness on `(mr_id, brochure_id)`.

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Server UUID — stable ID for this copy |
| `mr_id` | Yes | Owner |
| `brochure_id` | Yes | Source admin brochure UUID |
| `brochure_title` | Yes | Original admin title at save time |
| `custom_title` | Yes | Display name (`Fervid`, `Fervid (2)`, …) |
| `original_brochure_data` | Yes | JSON snapshot of assigned brochure metadata at download |
| `storage_id` | Yes | Local folder key; server should store equivalent or map via `saved_brochure.id` |
| `saved_at` | Yes | When MR saved/downloaded |
| `last_accessed` | Recommended | Updated on view |
| `is_deleted` | Yes | Soft-delete tombstone |
| `created_at` / `updated_at` | Yes | Audit |

**MR actions that change this record:**

| Action | Server operation |
|--------|------------------|
| Download brochure | **CREATE** new `SavedBrochure` row (never upsert/dedupe by `brochure_id`) |
| Rename saved copy | **UPDATE** `custom_title` only |
| Delete saved copy | **SOFT DELETE** (`is_deleted = true`) |
| View saved copy | **UPDATE** `last_accessed` (optional but useful) |

**API expectations:**

- `POST /api/mr/saved-brochures/` — always insert a new row
- `GET /api/mr/saved-brochures/` — return all non-deleted copies (including multiple per source `brochure_id`)
- `PATCH /api/mr/saved-brochures/{saved_brochure_id}/` — update by saved copy ID
- `DELETE /api/mr/saved-brochures/{saved_brochure_id}/` — soft-delete one copy only

See also: `docs/BACKEND_SAVED_BROCHURES_REQUIREMENTS.md`

---

### 3.2 Saved Brochure — Binary Files

Each saved copy has its own file tree under `brochures/{storage_id}/`. **All of this must be on server** for full restore:

| Asset | When created | Restore need |
|-------|--------------|--------------|
| Source file (ZIP or PDF) | On download | Re-download or re-process on new device |
| `brochure_data.json` | After ZIP/PDF processing | Master metadata for slides + groups |
| Per-slide image files (`slides/{slideId}.jpg` etc.) | ZIP extract, PDF conversion, or MR-added slide | Required to view/present |
| Thumbnail image | After processing | Can regenerate, but storing saves time |
| MR-added slide images | MR adds slide from photo library | **Must upload** — MR-created content |

**Critical rule:** Multiple saved copies of the same admin brochure must have **separate file bundles** on server, keyed by `saved_brochure_id` (not source `brochure_id`).

---

### 3.3 Brochure Slide Edits (`BrochureSync`)

**Triggered when MR:** edits slides in Slide Management (reachable from Saved → View on ZIP/PDF brochures).

**Server entity:** `BrochureSync` — **one per saved copy** (not per source brochure).

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Server UUID |
| `mr_id` | Yes | Owner |
| `saved_brochure_id` | **Yes** | Which saved copy these edits belong to |
| `brochure_id` | Yes | Source admin brochure (reference only) |
| `brochure_title` | Yes | Title at sync time |
| `brochure_data` | Yes | Full JSON (see below) |
| `brochure_data_url` | Yes | URL to `brochure_data.json` on file storage |
| `last_modified` | Yes | Conflict resolution |
| `is_deleted` | Yes | If copy deleted |

#### `brochure_data` JSON structure

```json
{
  "id": "...",
  "title": "...",
  "description": "...",
  "category": "...",
  "slides": [
    {
      "id": "uuid",
      "title": "Slide title",
      "fileName": "slide_001.jpg",
      "imageUri": "server-url-after-upload",
      "order": 0,
      "groupId": "deprecated",
      "groupIds": ["group-uuid"],
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "groups": [
    {
      "id": "uuid",
      "name": "Dr. John Smith",
      "color": "#hex",
      "slideIds": ["slide-uuid"],
      "order": 0,
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601",
      "doctorId": "doctor-server-uuid"
    }
  ],
  "thumbnailUri": "url",
  "totalSlides": 12,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "localLastModified": "ISO-8601",
  "needsSync": false,
  "isModified": false
}
```

**MR actions that must persist via brochure sync:**

| # | MR action | What to save |
|---|-----------|--------------|
| 1 | Rename slide(s) | `slides[].title`, `slides[].updatedAt` |
| 2 | Sort slides alphabetically | `slides[].order` |
| 3 | Add slide from photo library | New `slides[]` entry + **upload image file** |
| 4 | Delete single slide | Remove from `slides[]`, delete image, update `groups[].slideIds` |
| 5 | Delete multiple slides | Same as above, batch |
| 6 | Create group (manual name) | New `groups[]` entry + `slideIds` |
| 7 | Create group named after doctor | `groups[]` with `doctorId` + `name` = doctor name |
| 8 | Rename group | `groups[].name`, `groups[].updatedAt` |
| 9 | Delete group | Remove `groups[]` entry; clear `groupIds` on slides |
| 10 | Add slides to existing group | Update `groups[].slideIds` |
| 11 | Remove slides from group | Update `groups[].slideIds`; clear slide `groupIds` |
| 12 | Any edit above on saved copy | Full updated `brochure_data.json` + changed slide images |

**Doctor-linked groups:** `groups[].doctorId` must be stored so MR can open **Doctors → View Slides** on a new device.

**API:** `PUT /api/mr/brochure-sync/` must accept `saved_brochure_id` once the backend field exists.

---

### 3.4 MR-Uploaded Brochures (permission-gated)

**Triggered when:** MR with `can_upload_brochures = true` uploads a brochure.

**Server entity:** `Brochure` (MR-created, may appear in their catalog).

| Field | Required |
|-------|----------|
| `title` | Yes |
| `category` | Yes |
| `description` | Optional |
| `file_url` | Yes — uploaded brochure file |
| `file_name` | Yes |
| `file_type` | Yes |
| `thumbnail_url` | Recommended |
| `pages` | Optional |
| `file_size` | Optional |
| `tags` | Optional |
| `is_public` | Yes (app sets `true`) |
| `uploaded_by` / `mr_id` | Yes — ownership |

**Binary files:** original brochure file + thumbnail.

**API:** `POST /api/mr/brochures/upload/`

---

### 3.5 Brochure Activity Logs (optional)

Not required to restore core workflow, but MR dashboard shows recent activities.

| Activity type | When | Metadata to store |
|---------------|------|-------------------|
| `brochure_download` | Download | `saved_brochure_id`, `brochure_id`, `storage_id` |
| `brochure_saved` | Saved to library | Same |
| `brochure_view` | View brochure | `saved_brochure_id`, `brochure_id` |
| `brochure_renamed` | Rename | `previous_title`, `new_title`, `saved_brochure_id` |
| `brochure_delete` | Delete copy | `saved_brochure_id`, `brochure_id` |
| `brochure_upload` | MR upload | `brochure_id` |

**Server entity:** `ActivityLog` per MR. **API:** `POST /api/activity-logs/`

---

### 3.6 Brochure actions that do NOT need server backup

| Action | Reason |
|--------|--------|
| Search / filter / tab switch | UI only |
| Pull-to-refresh | Read operation |
| Toggle orientation in viewer | UI only |
| BrochureViewer Notes modal (Save) | Stub — does not persist |
| Local view count display | Unless analytics desired |
| PresentationMode / PresentationsScreen | Not wired in MR navigation; stubs |

---

## 4. Meetings

### 4.1 Meeting Record (core)

**Triggered when MR:** schedules a meeting (Meetings tab, global modal, or inline from slide-notes flow).

**Server entity:** `Meeting`

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Server UUID |
| `mr_id` | Yes | Owner |
| `doctor_id` | Yes | **Server doctor ID** (not local device ID) |
| `title` | Yes | |
| `purpose` | Yes | |
| `scheduled_date` | Yes | ISO datetime |
| `duration_minutes` | Yes | Default 30 |
| `status` | Yes | `scheduled`, `completed`, `cancelled`, etc. |
| `location` | Optional | In schema, rarely used in UI |
| `notes` | Optional | General notes field on meeting itself |
| `brochure_id` | Optional | Set when meeting created from brochure/notes flow |
| `brochure_title` | Optional | Denormalized brochure name |
| `follow_up_required` | Optional | Legacy flag on meeting |
| `follow_up_date` | Optional | Legacy — superseded by follow-ups table |
| `follow_up_time` | Optional | Legacy |
| `follow_up_notes` | Optional | Legacy |
| `is_deleted` | Yes | Soft-delete tombstone |
| `created_at` / `updated_at` | Yes | |

**MR actions:**

| Action | Server operation |
|--------|------------------|
| Schedule meeting | **CREATE** |
| Edit meeting (doctor, title, date, time, duration, notes) | **UPDATE** all changed fields |
| Delete meeting | **SOFT DELETE** + cascade delete notes & follow-ups |

**Restore dependency:** meeting requires `doctor_id` to already exist on server.

**API:**

- `POST /api/mr/meetings/`
- `PATCH /api/mr/meetings/{id}/`
- `DELETE /api/mr/meetings/{id}/`
- `GET /api/mr/meetings/`
- `GET /api/mr/meetings/{id}/`

---

### 4.2 Meeting Follow-Ups

**Triggered when MR:** adds follow-up from Meetings list or Meeting Details.

**Server entity:** `MeetingFollowUp` (multiple per meeting)

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Server UUID |
| `meeting_id` | Yes | Parent meeting server ID |
| `follow_up_date` | Yes | Date |
| `follow_up_time` | Yes | Time (e.g. `09:00`) |
| `follow_up_notes` | Optional | Text |
| `status` | Yes | `scheduled` / `completed` / `cancelled` |
| `sequence_number` | Yes | Order within meeting (1, 2, 3…) |
| `is_deleted` | Yes | Soft-delete |
| `created_at` / `updated_at` | Yes | |

**MR actions:**

| Action | Server operation |
|--------|------------------|
| Create follow-up (Meetings list) | **CREATE** (always new, even if UI says "Edit") |
| Create follow-up (Meeting Details) | **CREATE** |
| Edit follow-up | **UPDATE** date, time, notes, status |
| Delete follow-up | **SOFT DELETE** + delete associated notes |

**Restore dependency:** follow-up requires parent `meeting_id`.

**API:**

- `POST /api/mr/meetings/{id}/followups/`
- `PATCH /api/mr/meetings/{id}/followups/{followup_id}/`
- `DELETE /api/mr/meetings/{id}/followups/{followup_id}/`

---

### 4.3 Meeting Notes (general + slide-specific)

**Triggered when MR:** adds notes in Meeting Details, Slide Management, or Doctor Group Viewer.

**Server entity:** `MeetingNote` (single table for both types)

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Server UUID |
| `meeting_id` | Yes | Parent meeting |
| `follow_up_id` | Optional | Links note to a specific follow-up |
| `slide_id` | Yes | Real slide UUID, or generated ID for general notes |
| `slide_title` | Yes | `"General Meeting Note"` or actual slide title |
| `slide_order` | Yes | **`0` = general meeting note**; `>0` = slide-specific |
| `brochure_id` | Yes | Source brochure context (may be empty for general) |
| `note_text` | Yes | The actual note content |
| `slide_image_uri` | **Yes for slide notes** | Snapshot of slide at note time — **must be uploaded as file** |
| `is_deleted` | Yes | Soft-delete |
| `created_at` / `updated_at` | Yes | |

**MR actions:**

| Action | Where | Server operation |
|--------|-------|------------------|
| Add general meeting note | Meeting Details | **CREATE** (`slide_order = 0`) |
| Add note to specific follow-up | Meeting Details | **CREATE** with `follow_up_id` |
| Add slide note during brochure presentation | SlideManagement | **CREATE** + **upload slide snapshot image** |
| Add slide note during doctor-group presentation | DoctorGroupViewer | **CREATE** + **upload slide snapshot image** |
| Edit note (any type) | Meeting Details | **UPDATE** `note_text` |
| Delete note | Meeting Details | **SOFT DELETE** |

**Restore on new device must include:**

- Note text
- Follow-up association (`follow_up_id`)
- Slide metadata (`slide_id`, `slide_title`, `slide_order`, `brochure_id`)
- **Slide snapshot image URL** (for slide notes where `slide_image_uri` is set)

**Restore dependency:** note requires `meeting_id`; optional `follow_up_id`; optional link to brochure.

**API:**

- `POST /api/mr/meetings/{id}/notes/`
- `PATCH /api/mr/meetings/{id}/notes/{note_id}/`
- `DELETE /api/mr/meetings/{id}/notes/{note_id}/`

---

### 4.4 Meeting creation from brochure context

When MR creates a meeting while saving a slide note, these extra fields must be saved on the meeting:

| Field | Value |
|-------|-------|
| `brochure_id` | Current brochure being presented |
| `brochure_title` | Brochure title |
| `notes` | May include `"Brochure: {title}"` |

---

### 4.5 Meeting Activity Logs (optional)

| Activity type | When |
|---------------|------|
| `meeting_scheduled` | Meeting created |
| `meeting_updated` | Meeting edited |

---

### 4.6 Meeting actions that do NOT need server backup

| Action | Reason |
|--------|--------|
| Search / filter meetings | UI only |
| View meeting card / details | Read |
| Filter button (no handler) | UI only |
| PresentationMode comments / end meeting | Stubs — no persistence |
| `doctorId` route param on Meetings screen | Unused |

---

## 5. Doctors

### 5.1 Doctor Profile (core)

**Triggered when MR:** adds or edits a doctor (Doctors tab, meeting form, group creation, notes flow).

**Server entity:** `Doctor` + `DoctorAssignment` (MR owns the assignment)

| Field | Required | Set by MR in UI |
|-------|----------|-----------------|
| `id` | Yes | — |
| `mr_id` | Yes | Implicit (logged-in MR) |
| `first_name` | Yes | Yes |
| `last_name` | Yes | Yes |
| `specialty` | Yes | Yes |
| `hospital` | Yes | Yes |
| `phone` | Optional | Yes |
| `email` | Optional | Yes |
| `location` | Optional | Yes |
| `profile_image_url` | Optional | Yes (after photo upload) |
| `notes` | Optional | In DB schema, not exposed in MR form |
| `relationship_status` | Yes | App sets `active` on create; displayed but not editable |
| `meetings_count` | Computed | Can be server-computed |
| `last_meeting_date` | Computed | Can be server-computed |
| `next_appointment` | Optional | Not set by MR UI |
| `is_deleted` | Yes | Soft-delete |
| `created_at` / `updated_at` | Yes | |

**MR actions:**

| Action | Server operation |
|--------|------------------|
| Add doctor | **CREATE** doctor + assignment |
| Edit doctor (any field in form) | **UPDATE** |
| Delete doctor (no meetings) | **SOFT DELETE** doctor + assignment |
| Delete doctor + all meetings | **SOFT DELETE** doctor + **cascade delete all related meetings, follow-ups, notes** |

**API:**

- `GET /api/mr/doctors/`
- `POST /api/mr/doctor-assignments/`
- `PATCH /api/mr/doctor-assignments/{id}/`
- `DELETE /api/mr/doctor-assignments/{id}/`

---

### 5.2 Doctor Photo (binary)

**Triggered when MR:** picks from gallery or takes camera photo in doctor form.

| Asset | Required |
|-------|----------|
| Photo image file | **Yes** — must be on server file storage |
| `profile_image_url` on doctor record | **Yes** — URL pointing to uploaded photo |

**MR actions:**

| Action | Server operation |
|--------|------------------|
| Upload / change photo | **UPLOAD file** + **UPDATE** `profile_image_url` |
| Remove photo | **DELETE file** + **CLEAR** `profile_image_url` |

Without the image file on server, doctor cards show no photo on a new device.

---

### 5.3 Doctor ↔ Brochure relationship (via slide groups)

Not a separate doctor record — stored inside **brochure sync `groups[].doctorId`**.

**Restore requirement:** when pulling brochure sync data, resolve `doctorId` to the MR's doctor list so **Doctors → View Slides** works.

---

### 5.4 Doctor Activity Logs (optional)

| Activity type | When |
|---------------|------|
| `doctor_added` | Doctor created |
| `doctor_updated` | Doctor edited |

---

### 5.5 Doctor actions that do NOT need server backup

| Action | Reason |
|--------|--------|
| Search / filter by specialty | UI only |
| View doctor card | Read |
| View relationship status badge | Read-only |
| View last meeting date | Derived from meetings |
| Tap-to-call / email | Not implemented |

---

## 6. Cross-Cutting Requirements

### 6.1 Delete propagation (tombstones)

Every delete in the app is a **soft delete**. Server must persist `is_deleted = true` and sync it down, or records reappear on a new device.

| Parent deleted | Children that must also be deleted |
|----------------|-------------------------------------|
| Doctor (+ cascade) | All meetings, follow-ups, notes for that doctor |
| Meeting | All follow-ups and notes for that meeting |
| Follow-up | All notes with that `follow_up_id` |
| Saved brochure copy | That copy's `BrochureSync` + files |

### 6.2 ID mapping

Mobile uses local UUIDs; server uses server UUIDs. Every create response must return server `id`, and pull must allow mapping:

| Local concept | Server ID field |
|---------------|-----------------|
| Doctor | `doctor_id` |
| Meeting | `meeting_id` |
| Follow-up | `follow_up_id` |
| Note | `note_id` |
| Saved brochure copy | `saved_brochure_id` |
| Brochure sync | `brochure_sync_id` |

### 6.3 Binary file inventory (complete list)

| File type | Tied to | Must upload |
|-----------|---------|-------------|
| Doctor profile photo | Doctor | Yes |
| Brochure source ZIP/PDF | SavedBrochure copy | Yes (per copy) |
| Slide images | BrochureSync / saved copy | Yes (including MR-added slides) |
| `brochure_data.json` | BrochureSync | Yes |
| Slide snapshot in meeting note | MeetingNote | Yes (when `slide_image_uri` present) |
| MR-uploaded brochure file | Brochure | Yes |
| MR-uploaded brochure thumbnail | Brochure | Recommended |

### 6.4 Multiple saved copies rule (critical)

| Rule | Detail |
|------|--------|
| N downloads of same admin brochure | N `SavedBrochure` rows |
| Slide edits | Scoped to `saved_brochure_id`, not source `brochure_id` |
| Rename / delete | Target specific `saved_brochure_id` |
| Restore | Pull all copies independently |

### 6.5 Sync push entity summary

Mobile sync push should support these entities (create / update / delete):

| Entity | Create | Update | Delete |
|--------|--------|--------|--------|
| `doctors` | Yes | Yes | Yes (soft) |
| `doctor_photos` | Yes | Yes | Yes |
| `saved_brochures` | Yes | Yes (title) | Yes (soft) |
| `brochure_sync` | Yes | Yes | Yes |
| `meetings` | Yes | Yes | Yes (soft) |
| `meeting_followups` | Yes | Yes | Yes (soft) |
| `meeting_notes` | Yes | Yes (text) | Yes (soft) |
| `activity_logs` | Yes | — | — |
| `brochures` (MR upload) | Yes | — | — |

### 6.6 Sync-down on login (per MR)

The following must be returned for the authenticated MR:

- [ ] All non-deleted doctors + `profile_image_url`
- [ ] All non-deleted saved brochure copies
- [ ] All brochure sync records + file URLs per `saved_brochure_id`
- [ ] All non-deleted meetings
- [ ] All non-deleted follow-ups
- [ ] All non-deleted notes + slide snapshot image URLs
- [ ] MR-uploaded brochures (if any)
- [ ] Admin-assigned brochure catalog (separate from MR backup)
- [ ] Activity logs (optional, for dashboard)

---

## 7. Summary Checklist

### Must-have server tables/entities (MR-scoped)

| # | Entity | CRUD | Binary files |
|---|--------|------|--------------|
| 1 | `Doctor` + `DoctorAssignment` | C/U/D | Photo |
| 2 | `SavedBrochure` | C/U/D | Source file per copy |
| 3 | `BrochureSync` (per saved copy) | C/U/D | `brochure_data.json` + all slide images |
| 4 | `Meeting` | C/U/D | — |
| 5 | `MeetingFollowUp` | C/U/D | — |
| 6 | `MeetingNote` | C/U/D | Slide snapshot images |
| 7 | `Brochure` (MR upload) | C | Brochure file + thumbnail |
| 8 | `ActivityLog` | C | Optional |

### Total MR actions producing server-persistable data

| Category | Distinct persistable actions |
|----------|------------------------------|
| **Brochures** | 16 record operations + 5 file/asset types |
| **Meetings** | 11 record operations + 1 file type (note snapshots) |
| **Doctors** | 6 record operations + 1 file type (photo) |

### Related mobile code

| Area | Files |
|------|-------|
| Local DB schema | `src/services/localDatabaseService.ts` |
| Brochure data model | `src/services/brochureManagementService.ts` |
| MR API client | `src/services/MRService.ts` |
| Offline-first writes | `src/services/offlineFirstService.ts` |
| Saved brochures (product) | `docs/BACKEND_SAVED_BROCHURES_REQUIREMENTS.md` |
| MR screens | `src/screens/mr/` |
| Slide editing | `src/screens/admin/SlideManagementScreen.tsx` |

---

## Contact

For questions about mobile behavior or field usage, refer to the MR screens and `localDatabaseService.ts` interfaces (`LocalDoctor`, `LocalMeeting`, `LocalMeetingNote`, `LocalMeetingFollowUp`, `LocalSavedBrochure`, `LocalBrochureSync`).
