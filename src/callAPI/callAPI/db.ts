// ─────────────────────────────────────────────────────────────────────────────
// callAPI / db.ts
// Server-function wrappers for call log persistence (Supabase).
//
// All functions are thin re-exports from the REST API client so
// consumers can import everything from "callAPI" without touching api-client.
//
// Database table: call_logs
//   id                uuid      PK
//   conversation_id   uuid      FK → conversations
//   caller_clerk_id   text
//   callee_clerk_id   text
//   kind              text      "audio" | "video"
//   status            text      "answered" | "missed" | "rejected" | "cancelled"
//   duration_seconds  int
//   started_at        timestamptz
//   ended_at          timestamptz
// ─────────────────────────────────────────────────────────────────────────────

export {
  logCall,
  getCallHistory,
  deleteCallLog,
  clearCallHistory,
} from "@/lib/api-client";

/**
 * Helper: format a duration in seconds as "m:ss".
 * Useful for the calls tab and call-ended banners.
 *
 * formatDuration(0)   → "0:00"
 * formatDuration(75)  → "1:15"
 * formatDuration(3600)→ "60:00"
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Helper: human-readable call summary line.
 * "Video · 2:34"   or   "Voice · Missed"
 */
export function formatCallSummary(
  kind: "audio" | "video",
  status: "answered" | "missed" | "rejected" | "cancelled",
  durationSeconds: number
): string {
  const kindLabel = kind === "video" ? "Video" : "Voice";
  if (status === "answered" && durationSeconds > 0) {
    return `${kindLabel} · ${formatDuration(durationSeconds)}`;
  }
  const statusLabel: Record<string, string> = {
    missed: "Missed",
    rejected: "Declined",
    cancelled: "Cancelled",
    answered: kindLabel,
  };
  return `${kindLabel} · ${statusLabel[status] ?? status}`;
}
