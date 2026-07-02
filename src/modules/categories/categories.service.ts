import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where = query.search
      ? { deletedAt: null, name: { contains: query.search } }
      : { deletedAt: null }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.category.count({ where }),
    ])

    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { products: true },
    })
    if (!item) throw new NotFoundException('Category not found')
    return item
  }

  create(body: Record<string, any>) {
    return this.prisma.category.create({
      data: {
        code: body.code ?? body.ma ?? `CAT-${Date.now()}`,
        name: body.name ?? body.ten,
        description: body.description ?? body.moTa ?? null,
        isActive: body.isActive ?? true,
      },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.category.update({
      where: { id },
      data: {
        code: body.code ?? body.ma,
        name: body.name ?? body.ten,
        description: body.description ?? body.moTa,
        isActive: body.isActive,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }
}
