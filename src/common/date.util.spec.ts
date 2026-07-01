import { datesInRange, isFutureDate } from './date.util'

describe('isFutureDate', () => {
  const today = new Date(Date.UTC(2026, 6, 1)) // 2026-07-01

  it('returns false for today', () => {
    expect(isFutureDate(new Date(Date.UTC(2026, 6, 1)), today)).toBe(false)
  })

  it('returns false for a past date', () => {
    expect(isFutureDate(new Date(Date.UTC(2026, 5, 30)), today)).toBe(false)
  })

  it('returns true for a future date', () => {
    expect(isFutureDate(new Date(Date.UTC(2026, 6, 2)), today)).toBe(true)
  })

  it('only compares calendar days, ignoring time-of-day', () => {
    // "today" at 23:59 UTC is still today, not future, even though the clock time is late
    const lateToday = new Date(Date.UTC(2026, 6, 1, 23, 59, 59))
    expect(isFutureDate(lateToday, today)).toBe(false)
  })
})

describe('datesInRange', () => {
  it('returns a single date when start === end', () => {
    const d = new Date(Date.UTC(2026, 5, 10))
    const result = datesInRange(d, d)
    expect(result).toHaveLength(1)
    expect(result[0].toISOString()).toBe('2026-06-10T00:00:00.000Z')
  })

  it('returns every UTC calendar day inclusive of both ends', () => {
    const start = new Date(Date.UTC(2026, 5, 28))
    const end = new Date(Date.UTC(2026, 6, 2))
    const result = datesInRange(start, end)
    expect(result.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ])
  })

  it('is not affected by the time-of-day component of start/end', () => {
    const start = new Date(Date.UTC(2026, 5, 10, 23, 30))
    const end = new Date(Date.UTC(2026, 5, 12, 1, 0))
    const result = datesInRange(start, end)
    expect(result.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
    ])
  })
})
