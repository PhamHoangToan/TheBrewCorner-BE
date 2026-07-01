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
}
