import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { TableStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = { deletedAt: null }
    if (query.areaId) where.areaId = query.areaId
    if (query.status) where.status = this.status(query.status)

    // Trả về TẤT CẢ order còn gắn bàn (trừ order đã hủy) — order thuộc phiên trước đã
    // được gỡ tableId khi "đặt bàn về trống" nên không sống lại. FE gộp mọi order của bàn
    // và gắn trạng thái thanh toán (từ invoice của order cha) + trạng thái pha chế cho từng món.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cafeTable.findMany({
        where,
        skip,
        take,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        include: {
          area: true,
          orders: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { createdAt: 'asc' },
            include: { items: true, invoice: true },
          },
        },
      }),
      this.prisma.cafeTable.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.cafeTable.findFirst({ where: { id, deletedAt: null }, include: { area: true, orders: true } })
    if (!item) throw new NotFoundException('Table not found')
    return item
  }

  async create(body: Record<string, any>) {
    const areaId = await this.resolveAreaId(body)
    return this.prisma.cafeTable.create({
      data: {
        code: body.code ?? `BAN-${Date.now()}`,
        name: body.name ?? body.tableName ?? body.tenban,
        areaId,
        seatCount: Number(body.seatCount ?? body.peopleCount ?? 2),
        status: this.status(body.status),
        displayOrder: Number(body.displayOrder ?? 0),
      },
      include: { area: true },
    })
  }

  async update(id: string, body: Record<string, any>) {
    const areaId = body.areaId || body.floor || body.tang ? await this.resolveAreaId(body) : undefined
    const nextStatus = body.status ? this.status(body.status) : undefined

    // "Đặt bàn về trống": chặn nếu còn món chưa thanh toán (tránh bỏ sót doanh thu),
    // rồi gỡ tableId của các order đã xong để phiên khách sau không thấy order cũ sống lại.
    if (nextStatus === 'AVAILABLE') {
      await this.clearTableSession(id)
    }

    return this.prisma.cafeTable.update({
      where: { id },
      data: {
        code: body.code,
        name: body.name ?? body.tableName ?? body.tenban,
        areaId,
        seatCount: body.seatCount ?? body.peopleCount,
        status: nextStatus,
        displayOrder: body.displayOrder,
      },
      include: { area: true },
    })
  }

  // Kết thúc phiên phục vụ 1 bàn: chỉ cho đặt trống khi mọi món ĐÃ thanh toán VÀ ĐÃ phục vụ,
  // rồi gỡ tableId order đã xong để phiên khách sau không thấy order cũ sống lại
  private async clearTableSession(tableId: string) {
    const orders = await this.prisma.order.findMany({
      where: { tableId, status: { not: 'CANCELLED' }, deletedAt: null },
      include: { items: true, invoice: true },
    })

    // Còn nợ tiền = order chưa thanh toán mà vẫn còn ít nhất 1 món chưa hủy/trả
    const hasUnpaid = orders.some((o) => {
      const paid = o.status === 'PAID' || o.invoice?.status === 'PAID'
      const hasBillableItem = o.items.some((i) => !['RETURNED', 'CANCELLED'].includes(i.status))
      return !paid && hasBillableItem
    })
    if (hasUnpaid) {
      throw new BadRequestException('Bàn còn món chưa thanh toán — vui lòng thanh toán hoặc hủy món trước khi đặt bàn về trống')
    }

    // Còn món chưa phục vụ xong (barista chưa làm xong) → không cho đặt trống, tránh mất món đã trả tiền
    const hasUnserved = orders.some((o) => o.items.some((i) => !['SERVED', 'RETURNED', 'CANCELLED'].includes(i.status)))
    if (hasUnserved) {
      throw new BadRequestException('Bàn còn món chưa phục vụ xong — vui lòng hoàn tất phục vụ trước khi đặt bàn về trống')
    }

    if (orders.length) {
      await this.prisma.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: { tableId: null },
      })
    }
  }

  async remove(id: string) {
    await this.prisma.cafeTable.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  private status(value: unknown): TableStatus {
    const raw = String(value ?? 'AVAILABLE').toLowerCase()
    if (raw.includes('serving') || raw.includes('phuc') || raw.includes('phục')) return 'SERVING'
    if (raw.includes('checkout') || raw.includes('thanh')) return 'CHECKOUT_REQUESTED'
    if (raw.includes('reserved')) return 'RESERVED'
    if (raw.includes('inactive')) return 'INACTIVE'
    return 'AVAILABLE'
  }

  private async resolveAreaId(body: Record<string, any>) {
    if (body.areaId) return body.areaId
    const name = body.floor ?? body.tang ?? 'Tang 1'
    const code = String(name).toUpperCase().replace(/\s+/g, '-')
    const area = await this.prisma.area.upsert({
      where: { code },
      update: {},
      create: { code, name, floor: name },
    })
    return area.id
  }
}
