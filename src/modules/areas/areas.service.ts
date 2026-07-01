import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const [items, total] = await this.prisma.$transaction([
      this.prisma.area.findMany({ skip, take, orderBy: { createdAt: 'desc' }, include: { tables: true } }),
      this.prisma.area.count(),
    ])
    return { items, total, page, limit }
  }

  create(body: Record<string, any>) {
    return this.prisma.area.create({
      data: {
        code: body.code ?? `AREA-${Date.now()}`,
        name: body.name ?? body.ten ?? body.floor,
        floor: body.floor ?? body.tang ?? null,
      },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.area.update({
      where: { id },
      data: { code: body.code, name: body.name ?? body.ten, floor: body.floor ?? body.tang },
    })
  }

  async remove(id: string) {
    await this.prisma.area.delete({ where: { id } })
    return { deleted: true }
  }
}
