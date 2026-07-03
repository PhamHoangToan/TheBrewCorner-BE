import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { OrderStatus, OrderType, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { redeemLoyaltyPoints, refundRedeemedPoints } from '../../common/loyalty.util'
import { convertToStockUnit } from '../../common/unit-conversion.util'
import { NotificationsService, NotifRole } from '../notifications/notifications.service'
import { LowStockJob } from '../jobs/low-stock.job'
import { InvoicesService } from '../invoices/invoices.service'
import { VouchersService } from '../vouchers/vouchers.service'

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly lowStockJob: LowStockJob,
    private readonly invoicesService: InvoicesService,
    private readonly vouchersService: VouchersService,
  ) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = { deletedAt: null }
    if (query.status) where.status = query.status
    if (query.tableId) where.tableId = query.tableId
    if (query.customerId) where.customerId = query.customerId

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { table: { include: { area: true } }, items: true, invoice: true, customer: true },
      }),
      this.prisma.order.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async findOne(identifier: string) {
    const item = await this.prisma.order.findFirst({
      where: { deletedAt: null, OR: [{ id: identifier }, { code: identifier }] },
      include: {
        table: {
          include: {
            area: true,
            orders: { where: { status: 'PAID' }, select: { id: true }, take: 1 },
          },
        },
        items: { include: { product: true, toppings: true } },
        invoice: true,
      },
    })
    if (!item) throw new NotFoundException('Order not found')
    return item
  }

  async findByCustomer(customerId: string) {
    const items = await this.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { table: { include: { area: true } }, items: true, invoice: true },
      take: 100,
    })

    return { items, total: items.length, page: 1, limit: 100 }
  }

  async create(body: Record<string, any>) {
    const tableId = body.tableId ?? (body.table ? await this.resolveTableId(body.table) : undefined)
    const items = (body.items ?? []) as Record<string, any>[]
    const products = await this.productsForItems(items)

    // Chặn đặt món đang báo hết hàng trong ngày (86 list)
    const now = new Date()
    const soldOutNames = items
      .map((item) => products.get(item.productId ?? item.id))
      .filter((p) => p?.soldOutUntil && p.soldOutUntil > now)
      .map((p) => p!.name)
    if (soldOutNames.length) {
      throw new BadRequestException(`Món tạm hết hàng hôm nay: ${[...new Set(soldOutNames)].join(', ')}`)
    }
    const subtotal = items.reduce((sum, item) => {
      const product = products.get(item.productId ?? item.id)
      const unitPrice = Number(item.unitPrice ?? item.price ?? product?.price ?? 0)
      return sum + unitPrice * Number(item.quantity ?? item.qty ?? 1)
    }, 0)

    // Validate điểm đổi TRƯỚC khi tạo order — tránh tạo order với tổng đã giảm
    // rồi mới phát hiện không đủ điểm
    const redeemPoints = Math.max(0, Math.floor(Number(body.redeemPoints ?? 0)))
    if (redeemPoints > 0) {
      if (!body.customerId) throw new BadRequestException('Cần đăng nhập để dùng điểm tích lũy')
      const customer = await this.prisma.user.findFirst({
        where: { id: String(body.customerId), deletedAt: null },
        select: { loyaltyPoints: true },
      })
      if (!customer || customer.loyaltyPoints < redeemPoints) {
        throw new BadRequestException(`Không đủ điểm tích lũy (hiện có ${customer?.loyaltyPoints ?? 0} điểm)`)
      }
    }

    // Validate voucher cá nhân TRƯỚC khi tạo order (FE đã trừ sẵn vào discountAmount)
    const voucherCode = body.voucherCode ? String(body.voucherCode) : null
    if (voucherCode) {
      if (!body.customerId) throw new BadRequestException('Cần đăng nhập để dùng voucher')
      await this.vouchersService.validate({ code: voucherCode, userId: String(body.customerId), totalAmount: subtotal })
    }

    const order = await this.prisma.order.create({
      data: {
        code: body.code ?? `ORD-${Date.now()}`,
        type: this.type(body.type),
        status: this.status(body.status ?? 'SENT'),
        tableId,
        createdById: body.createdById,
        customerId: body.customerId,
        peopleCount: Number(body.peopleCount ?? 1),
        subtotal,
        discountAmount: Number(body.discountAmount ?? 0),
        totalAmount: Number(body.totalAmount ?? subtotal),
        note: body.note ? String(body.note).slice(0, 255) : null,
        items: {
          create: items.map((item) => {
            const product = products.get(item.productId ?? item.id)
            const quantity = Number(item.quantity ?? item.qty ?? 1)
            const unitPrice = Number(item.unitPrice ?? item.price ?? product?.price ?? 0)
            return {
              productId: product?.id ?? item.productId,
              productName: item.productName ?? item.name ?? product?.name ?? 'Mon',
              quantity,
              unitPrice,
              totalPrice: unitPrice * quantity,
            }
          }),
        },
      },
      include: { items: true, table: true },
    })

    if (tableId) {
      await this.prisma.cafeTable.update({ where: { id: tableId }, data: { status: 'SERVING' } })
    }

    // Đổi điểm tích lũy: FE đã trừ sẵn vào discountAmount/totalAmount, BE chỉ
    // trừ điểm + ghi giao dịch REDEEM (hoàn lại nếu hủy đơn)
    if (redeemPoints > 0 && body.customerId) {
      await redeemLoyaltyPoints(this.prisma, {
        userId: String(body.customerId),
        orderId: order.id,
        orderCode: order.code,
        points: redeemPoints,
      })
    }

    if (voucherCode && body.customerId) {
      await this.vouchersService.consume(voucherCode, String(body.customerId), order.id)
    }

    if (body.pendingTransferCode) {
      const paid = await this.payFromPendingTransfer(order.id, order.totalAmount, String(body.pendingTransferCode))
      if (paid) order.status = 'PAID' as OrderStatus
    }

    const tableLabel = order.table ? `Bàn ${order.table.name}` : 'Mang về'

    // Barista và cashier luôn nhận thông báo order mới
    // Waiter chỉ nhận khi tại bàn hoặc mang về (không phải giao tận nhà)
    const notifyRoles: NotifRole[] = ['barista', 'cashier']
    if ((order.type as string) !== 'DELIVERY') {
      notifyRoles.push('waiter')
    }
    await this.notifications.send({
      role: notifyRoles,
      title: 'Order mới',
      body: `${tableLabel} — ${order.items.length} món`,
      type: 'ORDER_NEW',
      refId: order.id,
    })

    return order
  }

  // Customer app chọn "chuyển khoản" trước khi tạo order (mã tham chiếu PendingTransfer đã
  // được Casso xác nhận PAID lúc chờ ở màn checkout). Tạo thẳng invoice đã thanh toán, không
  // để order rơi vào trạng thái chờ thanh toán thủ công.
  private async payFromPendingTransfer(orderId: string, totalAmount: unknown, code: string): Promise<boolean> {
    const pending = await this.prisma.pendingTransfer.findUnique({ where: { code } })
    if (!pending || pending.status !== 'PAID') return false

    const amount = parseFloat(String(totalAmount ?? pending.amount))
    const invoice = await this.invoicesService.create({
      orderId,
      subtotal: amount,
      discountAmount: 0,
      totalAmount: amount,
    })
    await this.invoicesService.pay(invoice.id, {
      method: 'BANK_TRANSFER',
      amount: parseFloat(String(pending.amount)),
      note: pending.tid ? `Casso: ${pending.tid}` : 'Xác nhận chuyển khoản trước khi tạo đơn',
    })
    await this.prisma.pendingTransfer.update({
      where: { code },
      data: { status: 'CONSUMED', orderId },
    })
    return true
  }

  async update(id: string, body: Record<string, any>) {
    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: body.status ? this.status(body.status) : undefined,
        peopleCount: body.peopleCount,
        subtotal: body.subtotal,
        discountAmount: body.discountAmount,
        totalAmount: body.totalAmount,
        note: body.note !== undefined ? String(body.note).slice(0, 255) : undefined,
      },
      include: { items: true, table: true },
    })

    const tableLabel = order.table ? `Bàn ${order.table.name}` : 'Mang về'

    if (body.status) {
      this.notifications.emitOrderUpdate(order.id, { status: order.status })
    }

    if (body.status === 'PREPARING') {
      await this.notifications.send({
        role: ['cashier', 'waiter'],
        title: 'Đang pha chế',
        body: `${tableLabel} — barista đang làm`,
        type: 'ORDER_PREPARING',
        refId: order.id,
      })
    }

    if (body.status === 'READY') {
      await this.notifications.send({
        role: ['cashier', 'waiter'],
        title: 'Món sẵn sàng',
        body: `${tableLabel} — sẵn sàng phục vụ`,
        type: 'ORDER_READY',
        refId: order.id,
      })
    }

    if (body.status === 'SERVED') {
      await this.notifications.send({
        role: ['cashier', 'waiter'],
        title: 'Món đã sẵn sàng',
        body: `${tableLabel} — tất cả món đã phục vụ xong`,
        type: 'ITEM_SERVED',
        refId: order.id,
      })
    }

    if (body.status === 'CHECKOUT_REQUESTED') {
      await this.notifications.send({
        role: 'cashier',
        title: 'Yêu cầu thanh toán',
        body: `${tableLabel} yêu cầu thanh toán`,
        type: 'CHECKOUT_REQUESTED',
        refId: order.id,
      })
    }

    if (body.status === 'CANCELLED') {
      // Hoàn điểm tích lũy nếu đơn này có dùng điểm (idempotent)
      await refundRedeemedPoints(this.prisma, order.id)
      await this.notifications.send({
        role: ['cashier', 'waiter'],
        title: 'Order bị huỷ',
        body: `${tableLabel} — order đã bị huỷ`,
        type: 'ORDER_CANCELLED',
        refId: order.id,
      })
    }

    return order
  }

  async updateItem(itemId: string, body: Record<string, any>) {
    const quantity = body.quantity ?? body.qty
    const unitPrice = body.unitPrice ?? body.price

    // Lưu trạng thái cũ trước khi update để biết có cần hoàn kho không
    const prevItem = body.status ? await this.prisma.orderItem.findUnique({ where: { id: itemId }, select: { status: true } }) : null
    const prevStatus = prevItem?.status ?? null

    const item = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        quantity,
        unitPrice,
        totalPrice: quantity && unitPrice ? Number(quantity) * Number(unitPrice) : undefined,
        status: body.status,
        note: body.note,
      },
      include: { order: { include: { table: true, items: true } } },
    })


    if (body.status === 'PREPARING') {
      const tableLabel = item.order.table ? `Bàn ${item.order.table.name}` : 'Mang về'
      await this.notifications.send({
        role: ['cashier', 'waiter'],
        title: 'Đang pha chế',
        body: `${item.productName} — ${tableLabel}`,
        type: 'ITEM_PREPARING',
        refId: item.orderId,
      })
    }

    if (body.status === 'READY') {
      const tableLabel = item.order.table ? `Bàn ${item.order.table.name}` : 'Mang về'
      await this.notifications.send({
        role: ['cashier', 'waiter'],
        title: 'Món sẵn sàng',
        body: `${item.productName} — ${tableLabel}`,
        type: 'ITEM_READY',
        refId: item.orderId,
      })
    }

    if (body.status === 'SERVED') {
      const tableLabel = item.order.table ? `Bàn ${item.order.table.name}` : 'Mang về'
      await this.notifications.send({
        role: ['cashier', 'waiter'],
        title: 'Món đã sẵn sàng',
        body: `${item.productName} — ${tableLabel}`,
        type: 'ITEM_SERVED',
        refId: item.orderId,
      })
      this.deductIngredientsByItem(item.productId, item.quantity).catch(() => {})
    }

    if (body.status === 'CANCELLED') {
      const tableLabel = item.order.table ? `Bàn ${item.order.table.name}` : 'Mang về'
      await this.notifications.send({
        role: ['cashier', 'waiter'],
        title: 'Món bị huỷ',
        body: `${item.productName} — ${tableLabel}`,
        type: 'ITEM_CANCELLED',
        refId: item.orderId,
      })
      // Hoàn lại kho nếu trước đó đã được SERVED (đã trừ kho)
      if (prevStatus === 'SERVED') {
        this.restoreIngredientsByItem(item.productId, item.quantity).catch(() => {})
      }
    }

    if (body.status === 'RETURNED' && String(body.note ?? '').startsWith('RETURN_REQUEST')) {
      const tableLabel = item.order.table ? `Bàn ${item.order.table.name}` : 'Mang về'
      await this.notifications.send({
        role: 'barista',
        title: 'Yêu cầu trả món',
        body: `${item.productName} — ${tableLabel}`,
        type: 'RETURN_REQUEST',
        refId: item.id,
      })
    }

    return item
  }

  async remove(id: string) {
    await this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  // Tách bill: chuyển các item được chọn sang order mới cùng bàn để thanh toán riêng
  async split(id: string, itemIds: string[]) {
    if (!itemIds?.length) throw new BadRequestException('Chọn ít nhất 1 món để tách')

    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { items: true, invoice: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    if (order.status === 'CANCELLED') throw new BadRequestException('Order đã bị hủy')
    if (order.status === 'PAID' || order.invoice?.status === 'PAID') {
      throw new BadRequestException('Order đã thanh toán, không thể tách')
    }

    const activeItems = order.items.filter((i) => !['CANCELLED', 'RETURNED'].includes(i.status))
    const moving = activeItems.filter((i) => itemIds.includes(i.id))
    if (moving.length !== itemIds.length) throw new BadRequestException('Có món không hợp lệ hoặc đã hủy/trả')
    if (moving.length === activeItems.length) {
      throw new BadRequestException('Không thể tách toàn bộ món — phải để lại ít nhất 1 món')
    }

    const newOrder = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          code: `ORD-${Date.now()}`,
          type: order.type,
          status: order.status,
          tableId: order.tableId,
          createdById: order.createdById,
          customerId: order.customerId,
          peopleCount: 1,
          note: `Tách từ ${order.code}`,
        },
      })
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { orderId: created.id },
      })
      await this.recomputeTotals(tx, order.id)
      await this.recomputeTotals(tx, created.id)
      return tx.order.findUnique({ where: { id: created.id }, include: { items: true, table: true } })
    }, { timeout: 15000, maxWait: 10000 })

    return { original: await this.findOne(order.id), splitOrder: newOrder }
  }

  // Gộp bàn/order: chuyển toàn bộ item của order nguồn vào order đích, hủy order nguồn
  async merge(id: string, sourceOrderId: string) {
    if (!sourceOrderId || sourceOrderId === id) throw new BadRequestException('Order nguồn không hợp lệ')

    const [target, source] = await Promise.all([
      this.prisma.order.findFirst({ where: { id, deletedAt: null }, include: { invoice: true } }),
      this.prisma.order.findFirst({ where: { id: sourceOrderId, deletedAt: null }, include: { invoice: true, items: true } }),
    ])
    if (!target || !source) throw new NotFoundException('Order not found')
    for (const [label, o] of [['đích', target], ['nguồn', source]] as const) {
      if (o.status === 'CANCELLED') throw new BadRequestException(`Order ${label} đã bị hủy`)
      if (o.status === 'PAID' || o.invoice?.status === 'PAID') {
        throw new BadRequestException(`Order ${label} đã thanh toán, không thể gộp`)
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { orderId: source.id },
        data: { orderId: target.id },
      })
      if (source.invoice) {
        await tx.invoice.update({ where: { id: source.invoice.id }, data: { status: 'VOID' } })
      }
      await tx.order.update({
        where: { id: source.id },
        data: {
          status: 'CANCELLED',
          subtotal: 0,
          totalAmount: 0,
          note: `Đã gộp vào ${target.code}`,
        },
      })
      // Bàn của order nguồn (nếu khác bàn đích) không còn order hoạt động → trả về trống
      if (source.tableId && source.tableId !== target.tableId) {
        const remaining = await tx.order.count({
          where: {
            tableId: source.tableId,
            deletedAt: null,
            status: { notIn: ['CANCELLED', 'PAID'] },
          },
        })
        if (remaining === 0) {
          await tx.cafeTable.update({ where: { id: source.tableId }, data: { status: 'AVAILABLE' } })
        }
      }
      await this.recomputeTotals(tx, target.id)
    }, { timeout: 15000, maxWait: 10000 })

    return this.findOne(target.id)
  }

  // Tính lại subtotal/totalAmount từ item còn hiệu lực (sau tách/gộp, bỏ giảm giá cũ)
  private async recomputeTotals(tx: Prisma.TransactionClient, orderId: string) {
    const items = await tx.orderItem.findMany({
      where: { orderId, status: { notIn: ['CANCELLED', 'RETURNED'] } },
    })
    const subtotal = items.reduce((sum, item) => sum + parseFloat(String(item.totalPrice)), 0)
    await tx.order.update({
      where: { id: orderId },
      data: { subtotal, discountAmount: 0, totalAmount: subtotal },
    })
  }

  private async deductIngredientsByItem(productId: string, orderQty: number) {
    await this.adjustStock(productId, orderQty, 'decrement')
  }

  private async restoreIngredientsByItem(productId: string, orderQty: number) {
    await this.adjustStock(productId, orderQty, 'increment')
  }

  private async adjustStock(productId: string, orderQty: number, direction: 'increment' | 'decrement') {
    const recipes = await this.prisma.productRecipe.findMany({
      where: { productId },
      include: { ingredient: { select: { unit: true, usagePerUnit: true } } },
    })
    if (!recipes.length) return

    const ingredientIds: string[] = []
    for (const recipe of recipes) {
      const waste = Number(recipe.wastePercent ?? 0)
      const rawQty = Number(recipe.quantity) * (1 + waste / 100) * orderQty
      const usagePerUnit = Number(recipe.ingredient.usagePerUnit ?? 1) || 1
      const stockUnit = recipe.ingredient.unit ?? ''
      const recipeUnit = recipe.unit ?? ''

      const delta = convertToStockUnit(rawQty, recipeUnit, stockUnit, usagePerUnit)

      await this.prisma.ingredient.update({
        where: { id: recipe.ingredientId },
        data: { stockQuantity: { [direction]: delta } },
      })
      ingredientIds.push(recipe.ingredientId)
    }

    if (direction === 'decrement') {
      this.lowStockJob.checkSpecificIngredients(ingredientIds).catch(() => {})
    }
  }

  async findReturnRequests() {
    return this.prisma.orderItem.findMany({
      where: { status: 'RETURNED', note: { startsWith: 'RETURN_REQUEST' } },
      include: {
        order: { include: { table: { include: { area: true } }, createdBy: true } },
        product: true,
      },
      orderBy: { order: { createdAt: 'desc' } },
    })
  }

  async approveReturn(itemId: string) {
    const item = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { note: 'RETURN_APPROVED' },
    })
    // Hoàn lại kho vì món đã được trả
    this.restoreIngredientsByItem(item.productId, item.quantity).catch(() => {})
    await this.notifications.send({
      role: 'waiter',
      title: 'Trả món được chấp nhận',
      body: `${item.productName} đã được duyệt trả`,
      type: 'RETURN_APPROVED',
      refId: item.id,
    })
    return item
  }

  async rejectReturn(itemId: string, reason: string) {
    const item = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { status: 'SERVED', note: `REJECTED:${reason ?? 'Không đồng ý'}` },
    })
    await this.notifications.send({
      role: 'waiter',
      title: 'Trả món bị từ chối',
      body: `${item.productName}: ${reason ?? 'Không đồng ý'}`,
      type: 'RETURN_REJECTED',
      refId: item.id,
    })
    return item
  }

  private async productsForItems(items: Record<string, any>[]) {
    const ids = items.map((item) => item.productId ?? item.id).filter(Boolean)
    const products = await this.prisma.product.findMany({ where: { OR: [{ id: { in: ids } }, { code: { in: ids } }] } })
    const productMap = new Map(products.flatMap((product) => [[product.id, product], [product.code, product]]))

    for (const item of items) {
      const key = item.productId ?? item.id
      if (!key || productMap.has(key)) continue

      const categoryName = item.category ?? 'Khac'
      const categoryCode = String(categoryName).toUpperCase().replace(/\s+/g, '-')
      const category = await this.prisma.category.upsert({
        where: { code: categoryCode },
        update: {},
        create: { code: categoryCode, name: categoryName },
      })
      const product = await this.prisma.product.create({
        data: {
          code: String(key),
          name: item.productName ?? item.name ?? 'Mon',
          type: item.type ?? 'Customer',
          unit: item.unit ?? 'Phan',
          price: Number(item.unitPrice ?? item.price ?? 0),
          categoryId: category.id,
        },
      })
      productMap.set(product.id, product)
      productMap.set(product.code, product)
      productMap.set(key, product)
    }

    return productMap
  }

  private async resolveTableId(value: string) {
    const table = await this.prisma.cafeTable.findFirst({
      where: { OR: [{ id: value }, { code: value }, { name: value }, { name: `Ban ${String(value).replace('BAN-', '')}` }] },
    })
    if (table) return table.id

    const code = value.startsWith('BAN-') ? value : `BAN-${value}`
    const area = await this.prisma.area.upsert({
      where: { code: 'CUSTOMER' },
      update: {},
      create: { code: 'CUSTOMER', name: 'Customer Area', floor: 'Customer' },
    })
    const created = await this.prisma.cafeTable.create({
      data: {
        code,
        name: `Ban ${code.replace('BAN-', '')}`,
        areaId: area.id,
        status: 'AVAILABLE',
      },
    })
    return created.id
  }

  private status(value: unknown): OrderStatus {
    const raw = String(value ?? 'SENT').toUpperCase()
    return (Object.values(OrderStatus) as string[]).includes(raw) ? (raw as OrderStatus) : 'SENT'
  }

  private type(value: unknown): OrderType {
    const raw = String(value ?? 'DINE_IN').toUpperCase()
    return raw.includes('TAKE') ? 'TAKE_AWAY' : 'DINE_IN'
  }
}
