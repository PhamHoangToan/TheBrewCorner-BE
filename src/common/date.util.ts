/** True if `date`'s UTC calendar day is after `now`'s UTC calendar day. */
export const isFutureDate = (date: Date, now: Date = new Date()): boolean => {
  const todayOnly = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dateOnly = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return dateOnly > todayOnly
}

/** Every UTC calendar day from `start` to `end`, inclusive. */
export const datesInRange = (start: Date, end: Date): Date[] => {
  const dates: Date[] = []
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (cur <= last) {
    dates.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}
