import { BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export const POINTS_PER_VND = 1 / 10000 // 10.000đ chi tiêu = 1 điểm
export const POINT_VALUE_VND = 500 // 1 điểm = 500đ khi đổi điểm thanh toán

// Giảm giá tự động theo hạng thành viên (%) — FE tự tính vào discountAmount khi checkout
export const TIER_DISCOUNT_PERCENT: Record<string, number> = {
  BASIC: 0,
  SILVER: 2,
  GOLD: 5,
}

// Trừ điểm của khách và ghi giao dịch REDEEM cho 1 order.
// Ghi points âm để lịch sử giao dịch tự cộng dồn đúng.
export const redeemLoyaltyPoints = async (
  prisma: PrismaService,
  params: { userId: string; orderId: string; orderCode?: string; points: number },
) => {
  const points = Math.floor(params.points)
  if (points <= 0) return 0

  const user = await prisma.user.findFirst({ where: { id: params.userId, deletedAt: null } })
  if (!user) throw new BadRequestException('Khách hàng không tồn tại')
  if (user.loyaltyPoints < points) {
    throw new BadRequestException(`Không đủ điểm tích lũy (hiện có ${user.loyaltyPoints} điểm)`)
  }

  const existing = await prisma.loyaltyTransaction.findFirst({
    where: { orderId: params.orderId, type: 'REDEEM' },
  })
  if (existing) throw new BadRequestException('Đơn này đã dùng điểm tích lũy rồi')

  await prisma.$transaction([
    prisma.user.update({
      where: { id: params.userId },
      data: { loyaltyPoints: { decrement: points } },
    }),
    prisma.loyaltyTransaction.create({
      data: {
        userId: params.userId,
        orderId: params.orderId,
        points: -points,
        type: 'REDEEM',
        description: `Dùng ${points} điểm cho đơn ${params.orderCode ?? params.orderId}`,
      },
    }),
  ])
  return points
}

// Ngưỡng hạng thành viên theo tổng chi tiêu lũy kế
const TIER_THRESHOLDS: Array<{ tier: string; minSpent: number }> = [
  { tier: 'GOLD', minSpent: 10_000_000 },
  { tier: 'SILVER', minSpent: 2_000_000 },
  { tier: 'BASIC', minSpent: 0 },
]
export const membershipTierForSpent = (totalSpent: number): string =>
  TIER_THRESHOLDS.find((t) => totalSpent >= t.minSpent)?.tier ?? 'BASIC'

// Đảo ngược điểm khi HOÀN TIỀN toàn bộ 1 đơn (idempotent):
//  - hoàn lại điểm khách đã đổi (REDEEM) — nếu có
//  - thu hồi điểm khách đã tích (EARN) + trừ totalSpent + hạ hạng nếu cần
export const reverseLoyaltyForRefund = async (
  prisma: PrismaService,
  params: { orderId: string; refundAmount: number },
) => {
  await refundRedeemedPoints(prisma, params.orderId)

  const earn = await prisma.loyaltyTransaction.findFirst({
    where: { orderId: params.orderId, type: 'EARN' },
  })
  if (!earn) return

  const already = await prisma.loyaltyTransaction.findFirst({
    where: { orderId: params.orderId, type: 'ADJUST', description: { startsWith: 'Thu hồi điểm' } },
  })
  if (already) return

  const user = await prisma.user.findFirst({ where: { id: earn.userId } })
  if (!user) return

  const points = earn.points // dương
  const newPoints = Math.max(0, user.loyaltyPoints - points)
  const newSpent = Math.max(0, parseFloat(String(user.totalSpent)) - params.refundAmount)
  const newTier = membershipTierForSpent(newSpent)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { loyaltyPoints: newPoints, totalSpent: newSpent, membershipTier: newTier as any },
    }),
    prisma.loyaltyTransaction.create({
      data: {
        userId: user.id,
        orderId: params.orderId,
        points: -points,
        type: 'ADJUST',
        description: 'Thu hồi điểm do hoàn tiền đơn',
      },
    }),
  ])
}

// Hoàn điểm đã dùng khi order bị hủy (idempotent — gọi nhiều lần chỉ hoàn 1 lần)
export const refundRedeemedPoints = async (prisma: PrismaService, orderId: string) => {
  const redeem = await prisma.loyaltyTransaction.findFirst({ where: { orderId, type: 'REDEEM' } })
  if (!redeem) return

  const refunded = await prisma.loyaltyTransaction.findFirst({
    where: { orderId, type: 'ADJUST', description: { startsWith: 'Hoàn điểm' } },
  })
  if (refunded) return

  const points = Math.abs(redeem.points)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: redeem.userId },
      data: { loyaltyPoints: { increment: points } },
    }),
    prisma.loyaltyTransaction.create({
      data: {
        userId: redeem.userId,
        orderId,
        points,
        type: 'ADJUST',
        description: 'Hoàn điểm do hủy đơn',
      },
    }),
  ])
}
