## Supabase ↔️ SQLite Schema Mapping

| Supabase table | SQLite table | Notes |
| --- | --- | --- |
| `users` | `users` | Cache profile fields for offline login and sync attribution. |
| `doctors` | `doctors` | Mirror all profile fields including counters and timestamps. |
| `doctor_assignments` | `doctor_assignments` | Mirror assignment status/notes/timestamps. |
| `meetings` | `meetings` | All schedule, follow-up, JSON fields included. |
| `meeting_slide_notes` | `meeting_notes` | Store `brochure_id`, `slide_image_uri`, timestamps. |
| `brochure_sync` | `brochure_sync` | Cache brochure JSON + modified timestamps per MR. |
| `saved_brochures` | `saved_brochures` | Local copy with custom title and original payload. |
| `activity_logs` | `activity_logs` (optional) | Only if offline auditing is needed. |
| `user_sessions` | `user_sessions` | Track device sessions for offline conflict checks. |
| `mr_permissions` | `mr_permissions` | Cache MR permissions when offline checks are required. |

**Next steps**

1. Confirm Supabase columns for each table (types, defaults, indexes).
2. Update `LocalDatabaseService.initialize()` to include missing tables (e.g., `saved_brochures`, `activity_logs`, `users`).
3. Ensure migrations keep schema versions aligned (e.g., `schema_version` table).

