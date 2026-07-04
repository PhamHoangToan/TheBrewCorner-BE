/**
 * Khi 1 yêu cầu SWAP (nhượng ca) được duyệt, ShiftAssignment cũ KHÔNG bị xóa mềm —
 * chỉ chuyển sang ABSENT + gắn note này, để admin vẫn thấy trong danh sách /shift
 * và biết cần tạo assignment mới cho người thay ca, thay vì ca biến mất không dấu vết.
 */
export const SWAP_RELEASED_NOTE = 'Đã nhượng ca — cần phân người thay'

export const mentionsShiftSwap = (note?: string | null): boolean => {
  const normalized = String(note ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return normalized.includes('nhuong ca')
}
