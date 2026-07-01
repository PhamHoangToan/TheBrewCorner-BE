import { mentionsPaidLeave } from './leave-note.util'

describe('mentionsPaidLeave', () => {
  it('returns false for null/undefined/empty notes', () => {
    expect(mentionsPaidLeave(null)).toBe(false)
    expect(mentionsPaidLeave(undefined)).toBe(false)
    expect(mentionsPaidLeave('')).toBe(false)
  })

  it('returns false for unrelated notes', () => {
    expect(mentionsPaidLeave('Tự động từ ca làm việc')).toBe(false)
    expect(mentionsPaidLeave('Bổ sung chấm công')).toBe(false)
  })

  it('matches Vietnamese "phép" regardless of diacritics/case', () => {
    expect(mentionsPaidLeave('Nghỉ phép')).toBe(true)
    expect(mentionsPaidLeave('Nghỉ phép năm')).toBe(true)
    expect(mentionsPaidLeave('Nghỉ phép (ốm)')).toBe(true)
    expect(mentionsPaidLeave('NGHI PHEP')).toBe(true)
    expect(mentionsPaidLeave('nghi phep')).toBe(true)
  })

  it('matches when appended to an existing note', () => {
    expect(mentionsPaidLeave('Đi trễ 10 phút · Nghỉ phép năm')).toBe(true)
  })

  it('matches the English fallback phrases', () => {
    expect(mentionsPaidLeave('paid leave')).toBe(true)
    expect(mentionsPaidLeave('on leave today')).toBe(true)
  })

  it('does not false-positive on words that merely contain "leave" as a substring', () => {
    expect(mentionsPaidLeave('cleaved the schedule')).toBe(false)
  })
})
