import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { money, pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = { deletedAt: null }

    if (query.search) where.name = { contains: query.search }
    if (query.categoryId) where.categoryId = query.categoryId

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          sizes: true,
          toppings: { include: { topping: true } },
          recipes: { include: { ingredient: { select: { name: true } } } },
        },
      }),
      this.prisma.product.count({ where }),
    ])

    return { items, total, page, limit }
  }

  async findOne(id: string) {
    const item = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true, sizes: true, toppings: { include: { topping: true } }, recipes: true },
    })
    if (!item) throw new NotFoundException('Product not found')
    return item
  }

  async create(body: Record<string, any>) {
    const categoryId = await this.resolveCategoryId(body)

    return this.prisma.product.create({
      data: {
        code: body.code ?? body.mamon ?? `P-${Date.now()}`,
        name: body.name ?? body.tenmon,
        type: body.type ?? body.loaimon ?? 'Do uong',
        unit: body.unit ?? body.donvitinh ?? 'Ly',
        price: money(body.price ?? body.gia) ?? 0,
        imageUrl: body.imageUrl ?? null,
        emoji: body.emoji ?? null,
        categoryId,
        isActive: body.isActive ?? true,
      },
      include: { category: true },
    })
  }

  async update(id: string, body: Record<string, any>) {
    const categoryId = body.categoryId || body.nhomthucdon || body.categoryName ? await this.resolveCategoryId(body) : undefined

    return this.prisma.product.update({
      where: { id },
      data: {
        code: body.code ?? body.mamon,
        name: body.name ?? body.tenmon,
        type: body.type ?? body.loaimon,
        unit: body.unit ?? body.donvitinh,
        price: money(body.price ?? body.gia),
        imageUrl: body.imageUrl,
        emoji: body.emoji,
        categoryId,
        isActive: body.isActive,
      },
      include: { category: true },
    })
  }

  async remove(id: string) {
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  async getRecipes(productId: string) {
    return this.prisma.productRecipe.findMany({
      where: { productId },
      include: { ingredient: { select: { id: true, name: true, unit: true } } },
      orderBy: { ingredient: { name: 'asc' } },
    })
  }

  async setRecipes(productId: string, items: Array<{ ingredientId: string; quantity: number; wastePercent?: number; unit: string }>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.productRecipe.deleteMany({ where: { productId } })
      if (items.length) {
        await tx.productRecipe.createMany({
          data: items.map((item) => ({
            productId,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            wastePercent: item.wastePercent ?? 0,
            unit: item.unit,
          })),
        })
      }
      return tx.productRecipe.findMany({
        where: { productId },
        include: { ingredient: { select: { id: true, name: true, unit: true } } },
        orderBy: { ingredient: { name: 'asc' } },
      })
    })
  }

  private async resolveCategoryId(body: Record<string, any>) {
    if (body.categoryId) return body.categoryId

    const name = body.categoryName ?? body.nhomthucdon ?? 'Khac'
    const code = String(name).toUpperCase().replace(/\s+/g, '-')
    const category = await this.prisma.category.upsert({
      where: { code },
      update: {},
      create: { code, name },
    })

    return category.id
  }
}
