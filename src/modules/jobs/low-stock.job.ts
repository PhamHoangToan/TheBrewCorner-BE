import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

interface LowStockRow {
  id: string
  name: string
  unit: string
  stockQuantity: number
  minQuantity: number
}

@Injectable()
export class LowStockJob {
  private readonly logger = new Logger(LowStockJob.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 */30 * * * *')
  async runScheduled() {
    this.logger.debug('Chạy kiểm tra kho theo lịch')
    await this.checkLowStock()
  }

  async checkLowStock() {
    const items = await this.prisma.$queryRaw<LowStockRow[]>`
      SELECT id, name, unit,
             CAST(stockQuantity AS DECIMAL(10,2)) AS stockQuantity,
             CAST(minQuantity   AS DECIMAL(10,2)) AS minQuantity
      FROM ingredients
      WHERE isActive = 1
        AND minQuantity > 0
        AND stockQuantity <= minQuantity
    `
    const count = await this.sendAlerts(items)
    if (count) this.logger.warn(`Đã gửi cảnh báo kho thấp cho ${count} nguyên liệu`)
  }

  // Gọi sau xuất kho — chỉ kiểm tra các ingredientId vừa xuất
  async checkSpecificIngredients(ingredientIds: string[]) {
    if (!ingredientIds.length) return
    const items = await this.prisma.$queryRaw<LowStockRow[]>`
      SELECT id, name, unit,
             CAST(stockQuantity AS DECIMAL(10,2)) AS stockQuantity,
             CAST(minQuantity   AS DECIMAL(10,2)) AS minQuantity
      FROM ingredients
      WHERE isActive = 1
        AND minQuantity > 0
        AND stockQuantity <= minQuantity
        AND id IN (${Prisma.join(ingredientIds)})
    `
    await this.sendAlerts(items)
  }

  private async sendAlerts(items: LowStockRow[]): Promise<number> {
    let sent = 0
    for (const item of items) {
      if (await this.isInCooldown(item.id)) continue

      await this.notificationsService.send({
        role: ['admin', 'barista'],
        title: '⚠️ Nguyên liệu sắp hết',
        body: `${item.name} còn ${Number(item.stockQuantity)} ${item.unit} (tối thiểu: ${Number(item.minQuantity)} ${item.unit})`,
        type: 'LOW_STOCK',
        refId: item.id,
      })
      sent++
    }
    return sent
  }

  private async isInCooldown(ingredientId: string): Promise<boolean> {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
    const recent = await this.prisma.notification.findFirst({
      where: { type: 'LOW_STOCK', refId: ingredientId, createdAt: { gte: fourHoursAgo } },
      select: { id: true },
    })
    return !!recent
  }
}
