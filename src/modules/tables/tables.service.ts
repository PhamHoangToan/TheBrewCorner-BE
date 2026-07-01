import { Injectable, NotFoundException } from '@nestjs/common'
import { TableStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.areaId) where.areaId = query.areaId
    if (query.status) where.status = this.status(query.status)

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cafeTable.findMany({
        where,
        skip,
        take,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        include: {
            area: true,
            orders: {
              where: {
                AND: [
                  { status: { not: 'CANCELLED' } },
                  {
                    OR: [
                      { status: { not: 'PAID' } },
                      {
                        status: 'PAID',
                        items: { some: { status: { notIn: ['SERVED', 'RETURNED', 'CANCELLED'] } } },
                      },
                    ],
                  },
                ],
              },
              orderBy: { createdAt: 'desc' },
              include: { items: true, invoice: true },
            },
          },
      }),
      this.prisma.cafeTable.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.cafeTable.findUnique({ where: { id }, include: { area: true, orders: true } })
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
    return this.prisma.cafeTable.update({
      where: { id },
      data: {
        code: body.code,
        name: body.name ?? body.tableName ?? body.tenban,
        areaId,
        seatCount: body.seatCount ?? body.peopleCount,
        status: body.status ? this.status(body.status) : undefined,
        displayOrder: body.displayOrder,
      },
      include: { area: true },
    })
  }

  async remove(id: string) {
    await this.prisma.cafeTable.delete({ where: { id } })
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
