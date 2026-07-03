import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'

const BIRTHDAY_DISCOUNT_PERCENT = 15
const randomSuffix = () => Math.random().toString(36).slice(2, 8).toUpperCase()

@Injectable()
export class BirthdayVoucherJob {
  private readonly logger = new Logger(BirthdayVoucherJob.name)

  constructor(private readonly prisma: PrismaService) {}

  // 6h sáng mỗi ngày (giờ server) — tặng voucher cho khách có sinh nhật trong tháng,
  // mỗi khách 1 voucher/năm (idempotent nhờ check voucher BDAY đã tạo trong năm)
  @Cron('0 0 6 * * *')
  async runScheduled() {
    const count = await this.grantBirthdayVouchers()
    if (count) this.logger.log(`Đã tặng ${count} voucher sinh nhật`)
  }

  async grantBirthdayVouchers() {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    // Khách (mọi role đều được, thực tế chủ yếu CUSTOMER) có sinh nhật trong tháng này
    const users = await this.prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM users
      WHERE deletedAt IS NULL AND birthday IS NOT NULL AND MONTH(birthday) = ${month}
    `
    if (!users.length) return 0

    // Voucher sinh nhật đã tặng trong năm nay cho các user này
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const existing = await this.prisma.personalVoucher.findMany({
      where: {
        userId: { in: users.map((u) => u.id) },
        code: { startsWith: 'BDAY-' },
        createdAt: { gte: yearStart },
      },
      select: { userId: true },
    })
    const alreadyGranted = new Set(existing.map((v) => v.userId))

    // Hết hạn cuối tháng sinh nhật (giờ VN ≈ dùng ngày cuối tháng UTC là đủ cho mục đích này)
    const expiresAt = new Date(Date.UTC(year, month, 0, 16, 59, 59, 999))

    let count = 0
    for (const user of users) {
      if (alreadyGranted.has(user.id)) continue
      await this.prisma.personalVoucher.create({
        data: {
          code: `BDAY-${randomSuffix()}`,
          userId: user.id,
          name: `Mừng sinh nhật ${user.name}`,
          discountPercent: BIRTHDAY_DISCOUNT_PERCENT,
          minOrderAmount: null,
          expiresAt,
        },
      })
      count += 1
    }
    return count
  }
}
