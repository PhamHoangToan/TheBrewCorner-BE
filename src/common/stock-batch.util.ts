// Helpers FEFO (First-Expired-First-Out) cho lô nguyên liệu (StockBatch).
// Nhận `db` là PrismaService hoặc transaction client — dùng được ở cả 2 ngữ cảnh.
// Best-effort: KHÔNG ném lỗi làm gãy luồng chính (bán hàng/xuất kho) nếu lô lệch dữ liệu.

// Trừ số lượng theo lô hết hạn sớm nhất trước. Dừng khi đã trừ đủ hoặc hết lô.
export const consumeBatchesFEFO = async (db: any, ingredientId: string, qty: number) => {
  let remaining = Number(qty)
  if (!(remaining > 0)) return
  const batches = await db.stockBatch.findMany({
    where: { ingredientId, quantity: { gt: 0 } },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
  })
  for (const b of batches) {
    if (remaining <= 0) break
    const take = Math.min(Number(b.quantity), remaining)
    await db.stockBatch.update({ where: { id: b.id }, data: { quantity: { decrement: take } } })
    remaining -= take
  }
}

// Hoàn số lượng về lô còn hạn muộn nhất (khi hủy đơn/trả món). Không có lô → bỏ qua
// (không tạo lô ảo thiếu HSD để tránh làm sai cảnh báo hạn dùng).
export const restoreBatchesFEFO = async (db: any, ingredientId: string, qty: number) => {
  if (!(Number(qty) > 0)) return
  const batch = await db.stockBatch.findFirst({
    where: { ingredientId },
    orderBy: [{ expiryDate: 'desc' }, { createdAt: 'desc' }],
  })
  if (!batch) return
  await db.stockBatch.update({ where: { id: batch.id }, data: { quantity: { increment: Number(qty) } } })
}
