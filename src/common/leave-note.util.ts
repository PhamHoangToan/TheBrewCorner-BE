/**
 * A ShiftAssignment.note is treated as "paid leave" if it mentions "phép" —
 * accent-insensitive, case-insensitive (also matches the English "paid leave" / "leave").
 * Shared by payroll (usesPaidLeave), leave-requests (approve), and shifts (createAssignment)
 * so the three stay in sync instead of drifting apart.
 */
export const mentionsPaidLeave = (note?: string | null): boolean => {
  const normalized = String(note ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return normalized.includes('phep') || normalized.includes('paid leave') || /\bleave\b/.test(normalized)
}
