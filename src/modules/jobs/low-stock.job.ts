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
    await this.checkStockForecast()
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

  // Dự đoán ngày hết hàng dựa trên tốc độ tiêu thụ trung bình 14 ngày — cảnh báo riêng nếu ≤3 ngày
  private async checkStockForecast() {
    const windowDays = 14
    const stockoutThresholdDays = 3
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

    const rows = await this.prisma.$queryRaw<Array<{
      id: string
      name: string
      unit: string
      stockQuantity: number
      totalUsed: number
    }>>`
      SELECT i.id, i.name, i.unit,
             CAST(i.stockQuantity AS DECIMAL(10,2)) AS stockQuantity,
             CAST(COALESCE(SUM(sei.quantity), 0) AS DECIMAL(10,2)) AS totalUsed
      FROM ingredients i
      LEFT JOIN stock_export_items sei ON sei.ingredientId = i.id
      LEFT JOIN stock_exports se ON se.id = sei.stockExportId
        AND se.reason = 'SALES' AND se.exportDate >= ${since}
      WHERE i.isActive = 1
      GROUP BY i.id, i.name, i.unit, i.stockQuantity
    `

    let sent = 0
    for (const row of rows) {
      const avgDailyUsage = Number(row.totalUsed) / windowDays
      if (avgDailyUsage <= 0) continue

      const daysUntilStockout = Number(row.stockQuantity) / avgDailyUsage
      if (daysUntilStockout > stockoutThresholdDays) continue
      if (await this.isInForecastCooldown(row.id)) continue

      await this.notificationsService.send({
        role: ['admin', 'barista'],
        title: '📉 Dự đoán sắp hết nguyên liệu',
        body: `${row.name}: còn khoảng ${daysUntilStockout.toFixed(1)} ngày sẽ hết (tốc độ dùng ~${avgDailyUsage.toFixed(1)} ${row.unit}/ngày)`,
        type: 'STOCK_FORECAST',
        refId: row.id,
      })
      sent++
    }
    if (sent) this.logger.warn(`Đã gửi cảnh báo dự đoán hết hàng cho ${sent} nguyên liệu`)
  }

  private async isInForecastCooldown(ingredientId: string): Promise<boolean> {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)
    const recent = await this.prisma.notification.findFirst({
      where: { type: 'STOCK_FORECAST', refId: ingredientId, createdAt: { gte: fourHoursAgo } },
      select: { id: true },
    })
    return !!recent
  }
}
