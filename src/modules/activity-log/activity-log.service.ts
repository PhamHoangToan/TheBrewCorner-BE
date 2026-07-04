import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

export interface RecordActivityInput {
  userId: string | null
  userName: string | null
  userRole: string | null
  method: string
  path: string
  module: string
  action: string
  description: string
  statusCode: number
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name)

  constructor(private readonly prisma: PrismaService) {}

  async record(data: RecordActivityInput) {
    try {
      await this.prisma.activityLog.create({ data })
    } catch (error) {
      // Ghi log không bao giờ được làm hỏng request chính đang xử lý.
      this.logger.error('Không ghi được activity log', error as Error)
    }
  }

  async findAll(query: QueryParams & { userId?: string; module?: string; from?: string; to?: string }) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.userId) where.userId = query.userId
    if (query.module) where.module = query.module
    if (query.from || query.to) {
      where.createdAt = {}
      if (query.from) where.createdAt.gte = new Date(query.from)
      if (query.to) where.createdAt.lte = new Date(query.to)
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.activityLog.count({ where }),
    ])
    return { items, total, page, limit }
  }

  // Top người thao tác nhiều nhất + khung giờ cao điểm — Prisma groupBy không group được
  // theo biểu thức (HOUR(createdAt)) nên lấy createdAt rồi tự group theo giờ ở JS
  // (đủ dùng cho quy mô dữ liệu 1 quán, tránh phải viết $queryRaw riêng cho MySQL).
  async stats(query: { from?: string; to?: string }) {
    const where: Record<string, any> = {}
    if (query.from || query.to) {
      where.createdAt = {}
      if (query.from) where.createdAt.gte = new Date(query.from)
      if (query.to) where.createdAt.lte = new Date(query.to)
    } else {
      // Không lọc ngày → mặc định 30 ngày gần nhất, tránh quét toàn bộ bảng log
      // (bảng ghi mọi request thay đổi dữ liệu, phình liên tục theo thời gian)
      where.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }

    const [byUser, byModule, rows] = await Promise.all([
      this.prisma.activityLog.groupBy({
        by: ['userId', 'userName'],
        where,
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
      this.prisma.activityLog.groupBy({
        by: ['module', 'action'],
        where,
        _count: true,
      }),
      this.prisma.activityLog.findMany({ where, select: { createdAt: true } }),
    ])

    // Quy đổi cứng UTC+7 (giờ VN) thay vì getHours() theo TZ server —
    // production trên Render chạy UTC nên biểu đồ sẽ lệch 7 tiếng nếu không quy đổi.
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
    for (const row of rows) byHour[new Date(row.createdAt.getTime() + VN_OFFSET_MS).getUTCHours()].count++

    return {
      byUser: byUser.map((u) => ({ userId: u.userId, userName: u.userName, count: u._count })),
      byModule: byModule.map((m) => ({ module: m.module, action: m.action, count: m._count })),
      byHour,
    }
  }
}
