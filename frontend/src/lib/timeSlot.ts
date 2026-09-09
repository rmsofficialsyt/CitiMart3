// Mirrors config/settings.py's TIME_SLOT_ORDER / time_slot_for_time exactly --
// duplicated here (not fetched) so the Manual Daily Entry page's Time Slot
// field can update instantly as the user types a Time Stamp, with no round
// trip. The server independently computes and persists the same value at
// save time (src/daily_dashboard_store.py); this is only for the read-only
// preview shown before that save happens. If the bands ever change, update
// both places.
export const TIME_SLOT_ORDER = ["11.00 AM - 01.59 PM", "02.00 PM - 04.59 PM", "05.00 PM - 07.59 PM", "08.00 PM - 11.59 PM"] as const;

const TIME_SLOT_BANDS: { label: string; startMin: number; endMin: number }[] = [
  { label: TIME_SLOT_ORDER[0], startMin: 11 * 60, endMin: 14 * 60 },
  { label: TIME_SLOT_ORDER[1], startMin: 14 * 60, endMin: 17 * 60 },
  { label: TIME_SLOT_ORDER[2], startMin: 17 * 60, endMin: 20 * 60 },
  { label: TIME_SLOT_ORDER[3], startMin: 20 * 60, endMin: 24 * 60 },
];

/** `hhmm` is an HH:MM (24-hour) string, as produced by an `<input type="time">`.
 * Returns null outside all 4 bands (before 11 AM) or for an incomplete/invalid
 * value, matching the server's don't-fabricate rule -- no slot is shown rather
 * than a guessed one. */
export function timeSlotForHHMM(hhmm: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const totalMin = hours * 60 + minutes;
  const band = TIME_SLOT_BANDS.find((b) => totalMin >= b.startMin && totalMin < b.endMin);
  return band?.label ?? null;
}
