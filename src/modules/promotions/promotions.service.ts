import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PromotionStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { money, pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where = query.search
      ? { deletedAt: null, OR: [{ name: { contains: query.search } }, { code: { contains: query.search } }] }
      : { deletedAt: null }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.promotion.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.promotion.count({ where }),
    ])

    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.promotion.findFirst({ where: { id, deletedAt: null } })
    if (!item) throw new NotFoundException('Promotion not found')
    return item
  }

  async findValid(totalAmount: number) {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    return this.prisma.promotion.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        startDate: { lte: todayEnd },
        endDate: { gte: todayStart },
        OR: [{ minOrderAmount: null }, { minOrderAmount: { lte: totalAmount } }],
      },
      orderBy: [{ discountPercent: 'desc' }, { createdAt: 'desc' }],
    })
  }

  // Danh sách khuyến mãi đang hiệu lực (bất kể đơn hàng bao nhiêu) — cho trang tin tức/ưu đãi Customer
  async findActive() {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    return this.prisma.promotion.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        startDate: { lte: todayEnd },
        endDate: { gte: todayStart },
      },
      orderBy: [{ discountPercent: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async validate(body: Record<string, any>) {
    const code = String(body.code ?? '').trim().toUpperCase()
    const totalAmount = Number(body.totalAmount ?? 0)
    if (!code) throw new BadRequestException('Promotion code is required')

    const promotion = await this.prisma.promotion.findFirst({ where: { code, deletedAt: null } })
    if (!promotion) throw new BadRequestException('Promotion code not found')

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    if (promotion.status !== 'ACTIVE' || promotion.startDate > todayEnd || promotion.endDate < todayStart) {
      throw new BadRequestException('Promotion code is not active')
    }

    const minOrderAmount = Number(promotion.minOrderAmount ?? 0)
    if (totalAmount < minOrderAmount) {
      throw new BadRequestException(`Promotion requires minimum order ${minOrderAmount}`)
    }

    const discountAmount = Math.round((totalAmount * Number(promotion.discountPercent)) / 100)
    return { promotion, discountAmount, finalAmount: Math.max(totalAmount - discountAmount, 0) }
  }

  create(body: Record<string, any>) {
    return this.prisma.promotion.create({
      data: {
        code: String(body.code ?? body.makm ?? `KM-${Date.now()}`).trim().toUpperCase(),
        name: body.name ?? body.tenkm ?? body.tenchuongtrinh,
        conditionText: body.conditionText ?? body.condition ?? body.dieukien ?? '',
        minOrderAmount: money(body.minOrderAmount),
        discountPercent: Math.min(100, Math.max(0, Number(body.discountPercent ?? body.giampercent ?? 0))),
        imageUrl: body.imageUrl ? String(body.imageUrl) : null,
        startDate: new Date(body.startDate ?? body.ngaybatdau ?? new Date()),
        endDate: new Date(body.endDate ?? body.ngayketthuc ?? new Date()),
        status: this.status(body.status ?? body.trangthai),
      },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.promotion.update({
      where: { id },
      data: {
        code: body.code || body.makm ? String(body.code ?? body.makm).trim().toUpperCase() : undefined,
        name: body.name ?? body.tenkm ?? body.tenchuongtrinh,
        conditionText: body.conditionText ?? body.condition ?? body.dieukien,
        minOrderAmount: money(body.minOrderAmount),
        discountPercent: body.discountPercent != null || body.giampercent != null
          ? Math.min(100, Math.max(0, Number(body.discountPercent ?? body.giampercent)))
          : undefined,
        imageUrl: body.imageUrl !== undefined ? (body.imageUrl ? String(body.imageUrl) : null) : undefined,
        startDate: body.startDate || body.ngaybatdau ? new Date(body.startDate ?? body.ngaybatdau) : undefined,
        endDate: body.endDate || body.ngayketthuc ? new Date(body.endDate ?? body.ngayketthuc) : undefined,
        status: body.status || body.trangthai ? this.status(body.status ?? body.trangthai) : undefined,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.promotion.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  private status(value: unknown): PromotionStatus {
    const raw = String(value ?? 'ACTIVE').toLowerCase()
    if (raw.includes('het') || raw.includes('hết') || raw === 'expired') return 'EXPIRED'
    if (raw === 'inactive') return 'INACTIVE'
    return 'ACTIVE'
  }
}
