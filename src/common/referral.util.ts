import { randomBytes } from 'crypto'

// Thưởng điểm giới thiệu bạn bè khi đơn PAID ĐẦU TIÊN của khách được giới thiệu hoàn tất
// (không thưởng khi mới đăng ký suông, tránh thưởng khống).
export const REFERRAL_BONUS_POINTS = 50

// Dùng chung bởi auth.service.ts (đăng ký mới) và users.service.ts (sinh lười cho khách cũ
// đăng ký trước khi có tính năng này, khi họ xem trang Profile lần đầu).
export const generateReferralCode = async (prisma: { user: { findFirst: (args: any) => Promise<any> } }): Promise<string> => {
  for (let i = 0; i < 5; i++) {
    const code = `REF-${randomBytes(3).toString('hex').toUpperCase()}`
    const existing = await prisma.user.findFirst({ where: { referralCode: code } })
    if (!existing) return code
  }
  return `REF-${Date.now().toString(36).toUpperCase()}`
}

interface ReferralDb {
  user: {
    findUnique: (args: any) => Promise<any>
    update: (args: any) => Promise<any>
  }
  invoice: {
    count: (args: any) => Promise<number>
  }
  loyaltyTransaction: {
    create: (args: any) => Promise<any>
  }
}

// Gọi bên trong transaction thanh toán hóa đơn (invoices.service.ts::pay()) — idempotent
// qua User.referralBonusGiven, không phụ thuộc order nào nên gọi nhiều lần chỉ thưởng 1 lần.
// Đếm theo Invoice.status='PAID' (không phải Order.status) vì đơn trả trước có thể chưa
// "hoàn tất phục vụ" (Order.status vẫn SENT/PREPARING) dù đã thu tiền xong.
export const grantReferralBonusIfEligible = async (db: ReferralDb, customerId: string) => {
  const user = await db.user.findUnique({ where: { id: customerId } })
  if (!user || !user.referredById || user.referralBonusGiven) return

  // Chỉ cần "đã từng có ít nhất 1 hóa đơn trả tiền" — cờ referralBonusGiven ở trên mới là
  // thứ chống thưởng lặp. Không so sánh === 1 vì nếu hóa đơn đầu bị refund/void rồi khách
  // mua đơn khác, count nhảy quá 1 và bonus sẽ trượt vĩnh viễn dù chưa từng được phát.
  const paidInvoiceCount = await db.invoice.count({ where: { status: 'PAID', order: { customerId } } })
  if (paidInvoiceCount < 1) return

  await db.user.update({
    where: { id: customerId },
    data: { loyaltyPoints: { increment: REFERRAL_BONUS_POINTS }, referralBonusGiven: true },
  })
  await db.user.update({
    where: { id: user.referredById },
    data: { loyaltyPoints: { increment: REFERRAL_BONUS_POINTS } },
  })
  await db.loyaltyTransaction.create({
    data: { userId: customerId, points: REFERRAL_BONUS_POINTS, type: 'ADJUST', description: 'Thưởng giới thiệu bạn bè (được giới thiệu)' },
  })
  await db.loyaltyTransaction.create({
    data: { userId: user.referredById, points: REFERRAL_BONUS_POINTS, type: 'ADJUST', description: 'Thưởng giới thiệu bạn bè (giới thiệu thành công)' },
  })
}
