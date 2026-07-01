import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

const money = (value: number) => new Prisma.Decimal(value)

async function main() {
  const users = await Promise.all([
    prisma.user.upsert({
      where: { code: 'NV001' },
      update: {},
      create: {
        code: 'NV001',
        name: 'Vo Thi Thuy Hoa',
        email: 'admin@thebrewcorner.local',
        phone: '0901234567',
        passwordHash: 'dev-password-change-me',
        role: 'ADMIN',
      },
    }),
    prisma.user.upsert({
      where: { code: 'NV002' },
      update: {},
      create: {
        code: 'NV002',
        name: 'Nguyen Thi Tu Trinh',
        email: 'cashier@thebrewcorner.local',
        phone: '0901234568',
        passwordHash: 'dev-password-change-me',
        role: 'CASHIER',
      },
    }),
    prisma.user.upsert({
      where: { code: 'NV003' },
      update: {},
      create: {
        code: 'NV003',
        name: 'Tran Quang Minh',
        email: 'waiter@thebrewcorner.local',
        phone: '0901234569',
        passwordHash: 'dev-password-change-me',
        role: 'WAITER',
      },
    }),
    prisma.user.upsert({
      where: { code: 'NV004' },
      update: {},
      create: {
        code: 'NV004',
        name: 'Vo Minh Tuan',
        email: 'barista@thebrewcorner.local',
        phone: '0901234570',
        passwordHash: 'dev-password-change-me',
        role: 'BARISTA',
      },
    }),
  ])

  const [admin, cashier, waiter, barista] = users

  const shift1 = await prisma.shift.upsert({
    where: { code: 'CA1' },
    update: {},
    create: { code: 'CA1', name: 'Ca 1 (6h-14h)', startTime: '06:00', endTime: '14:00' },
  })

  const shift2 = await prisma.shift.upsert({
    where: { code: 'CA2' },
    update: {},
    create: { code: 'CA2', name: 'Ca 2 (14h-22h)', startTime: '14:00', endTime: '22:00' },
  })

  await Promise.all([
    prisma.shiftAssignment.upsert({
      where: { userId_shiftId_workDate: { userId: admin.id, shiftId: shift1.id, workDate: new Date('2026-06-26') } },
      update: {},
      create: { userId: admin.id, shiftId: shift1.id, workDate: new Date('2026-06-26') },
    }),
    prisma.shiftAssignment.upsert({
      where: { userId_shiftId_workDate: { userId: cashier.id, shiftId: shift1.id, workDate: new Date('2026-06-26') } },
      update: {},
      create: { userId: cashier.id, shiftId: shift1.id, workDate: new Date('2026-06-26') },
    }),
    prisma.shiftAssignment.upsert({
      where: { userId_shiftId_workDate: { userId: waiter.id, shiftId: shift2.id, workDate: new Date('2026-06-26') } },
      update: {},
      create: { userId: waiter.id, shiftId: shift2.id, workDate: new Date('2026-06-26') },
    }),
    prisma.shiftAssignment.upsert({
      where: { userId_shiftId_workDate: { userId: barista.id, shiftId: shift1.id, workDate: new Date('2026-06-26') } },
      update: {},
      create: { userId: barista.id, shiftId: shift1.id, workDate: new Date('2026-06-26') },
    }),
  ])

  const floor1 = await prisma.area.upsert({
    where: { code: 'F1' },
    update: {},
    create: { code: 'F1', name: 'Tang 1', floor: 'Tang 1' },
  })

  const floor2 = await prisma.area.upsert({
    where: { code: 'F2' },
    update: {},
    create: { code: 'F2', name: 'Tang 2', floor: 'Tang 2' },
  })

  const tableDefs = [
    // Tầng 1 — 8 bàn
    { code: 'BAN-01', name: 'Bàn 01', areaId: floor1.id, seatCount: 2, displayOrder: 1 },
    { code: 'BAN-02', name: 'Bàn 02', areaId: floor1.id, seatCount: 2, displayOrder: 2 },
    { code: 'BAN-03', name: 'Bàn 03', areaId: floor1.id, seatCount: 4, displayOrder: 3 },
    { code: 'BAN-04', name: 'Bàn 04', areaId: floor1.id, seatCount: 4, displayOrder: 4 },
    { code: 'BAN-05', name: 'Bàn 05', areaId: floor1.id, seatCount: 4, displayOrder: 5 },
    { code: 'BAN-06', name: 'Bàn 06', areaId: floor1.id, seatCount: 6, displayOrder: 6 },
    { code: 'BAN-07', name: 'Bàn 07', areaId: floor1.id, seatCount: 6, displayOrder: 7 },
    { code: 'BAN-08', name: 'Bàn 08', areaId: floor1.id, seatCount: 8, displayOrder: 8 },
    // Tầng 2 — 7 bàn
    { code: 'BAN-09', name: 'Bàn 09', areaId: floor2.id, seatCount: 2, displayOrder: 9 },
    { code: 'BAN-10', name: 'Bàn 10', areaId: floor2.id, seatCount: 2, displayOrder: 10 },
    { code: 'BAN-11', name: 'Bàn 11', areaId: floor2.id, seatCount: 4, displayOrder: 11 },
    { code: 'BAN-12', name: 'Bàn 12', areaId: floor2.id, seatCount: 4, displayOrder: 12 },
    { code: 'BAN-13', name: 'Bàn 13', areaId: floor2.id, seatCount: 4, displayOrder: 13 },
    { code: 'BAN-14', name: 'Bàn 14', areaId: floor2.id, seatCount: 6, displayOrder: 14 },
    { code: 'BAN-15', name: 'Bàn 15', areaId: floor2.id, seatCount: 6, displayOrder: 15 },
  ]

  const tables = await Promise.all(
    tableDefs.map((t) =>
      prisma.cafeTable.upsert({
        where: { code: t.code },
        update: { name: t.name, seatCount: t.seatCount, displayOrder: t.displayOrder },
        create: { ...t, status: 'AVAILABLE' },
      }),
    ),
  )

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { code: 'COFFEE' },
      update: {},
      create: { code: 'COFFEE', name: 'Coffee' },
    }),
    prisma.category.upsert({
      where: { code: 'TEA' },
      update: {},
      create: { code: 'TEA', name: 'Tra' },
    }),
    prisma.category.upsert({
      where: { code: 'CAKE' },
      update: {},
      create: { code: 'CAKE', name: 'Banh' },
    }),
  ])

  const [coffee, tea, cake] = categories

  const products = await Promise.all([
    prisma.product.upsert({
      where: { code: 'U01' },
      update: {},
      create: { code: 'U01', name: 'Cappuccino', type: 'Do uong', unit: 'Ly', price: money(65000), emoji: 'coffee', categoryId: coffee.id },
    }),
    prisma.product.upsert({
      where: { code: 'U02' },
      update: {},
      create: { code: 'U02', name: 'Cafe Latte', type: 'Do uong', unit: 'Ly', price: money(65000), emoji: 'coffee', categoryId: coffee.id },
    }),
    prisma.product.upsert({
      where: { code: 'U03' },
      update: {},
      create: { code: 'U03', name: 'Espresso', type: 'Do uong', unit: 'Ly', price: money(39000), emoji: 'coffee', categoryId: coffee.id },
    }),
    prisma.product.upsert({
      where: { code: 'U04' },
      update: {},
      create: { code: 'U04', name: 'Tra Thach Dao', type: 'Do uong', unit: 'Ly', price: money(39000), emoji: 'tea', categoryId: tea.id },
    }),
    prisma.product.upsert({
      where: { code: 'U06' },
      update: {},
      create: { code: 'U06', name: 'Black Coffee', type: 'Do uong', unit: 'Ly', price: money(25000), emoji: 'coffee', categoryId: coffee.id },
    }),
    prisma.product.upsert({
      where: { code: 'U07' },
      update: {},
      create: { code: 'U07', name: 'Flat White', type: 'Do uong', unit: 'Ly', price: money(45000), emoji: 'coffee', categoryId: coffee.id },
    }),
    prisma.product.upsert({
      where: { code: 'A01' },
      update: {},
      create: { code: 'A01', name: 'Tiramisu', type: 'Do an', unit: 'Phan', price: money(30000), emoji: 'cake', categoryId: cake.id },
    }),
    prisma.product.upsert({
      where: { code: 'A02' },
      update: {},
      create: { code: 'A02', name: 'Pho Mai Tra Xanh', type: 'Do an', unit: 'Phan', price: money(29000), emoji: 'cake', categoryId: cake.id },
    }),
  ])

  await prisma.topping.upsert({
    where: { code: 'TOP001' },
    update: {},
    create: { code: 'TOP001', name: 'Kem tuoi', price: money(10000) },
  })

  const ingredients = await Promise.all([
    prisma.ingredient.upsert({
      where: { code: 'NVL001' },
      update: {},
      create: { code: 'NVL001', name: 'Ca phe Arabica', unit: 'kg', stockQuantity: money(12), minQuantity: money(5) },
    }),
    prisma.ingredient.upsert({
      where: { code: 'NVL002' },
      update: {},
      create: { code: 'NVL002', name: 'Sua tuoi', unit: 'lit', stockQuantity: money(3), minQuantity: money(5) },
    }),
    prisma.ingredient.upsert({
      where: { code: 'NVL003' },
      update: {},
      create: { code: 'NVL003', name: 'Duong trang', unit: 'kg', stockQuantity: money(8), minQuantity: money(3) },
    }),
    prisma.ingredient.upsert({
      where: { code: 'NVL004' },
      update: {},
      create: { code: 'NVL004', name: 'Tra xanh matcha', unit: 'kg', stockQuantity: money(0), minQuantity: money(2) },
    }),
  ])

  const importDoc = await prisma.stockImport.upsert({
    where: { code: 'PNK-0001' },
    update: {},
    create: {
      code: 'PNK-0001',
      importDate: new Date('2026-06-26'),
      supplierName: 'Nha cung cap mac dinh',
      note: 'Seed data',
      totalAmount: money(500000),
      createdById: barista.id,
    },
  })

  await prisma.stockImportItem.upsert({
    where: { id: 'seed-import-item-001' },
    update: {},
    create: {
      id: 'seed-import-item-001',
      stockImportId: importDoc.id,
      ingredientId: ingredients[0].id,
      ingredientName: ingredients[0].name,
      quantity: money(10),
      unit: ingredients[0].unit,
      unitPrice: money(50000),
      totalPrice: money(500000),
    },
  })

  const exportDoc = await prisma.stockExport.upsert({
    where: { code: 'PXK-0001' },
    update: {},
    create: {
      code: 'PXK-0001',
      exportDate: new Date('2026-06-26'),
      reason: 'SALES',
      note: 'Seed data',
      createdById: barista.id,
    },
  })

  await prisma.stockExportItem.upsert({
    where: { id: 'seed-export-item-001' },
    update: {},
    create: {
      id: 'seed-export-item-001',
      stockExportId: exportDoc.id,
      ingredientId: ingredients[1].id,
      ingredientName: ingredients[1].name,
      quantity: money(2),
      unit: ingredients[1].unit,
    },
  })

  const promotion = await prisma.promotion.upsert({
    where: { code: 'KM001' },
    update: {},
    create: {
      code: 'KM001',
      name: 'Giam 5% don tren 300K',
      conditionText: 'Don tren 300.000 VND',
      minOrderAmount: money(300000),
      discountPercent: 5,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: 'ACTIVE',
    },
  })

  await prisma.promotion.upsert({
    where: { code: 'KM002' },
    update: {},
    create: {
      code: 'KM002',
      name: 'Giam 8% don tren 450K',
      conditionText: 'Don tren 450.000 VND',
      minOrderAmount: money(450000),
      discountPercent: 8,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: 'ACTIVE',
    },
  })

  const order = await prisma.order.upsert({
    where: { code: 'ORD-0001' },
    update: {},
    create: {
      code: 'ORD-0001',
      type: 'DINE_IN',
      status: 'CHECKOUT_REQUESTED',
      tableId: tables[0].id,
      createdById: waiter.id,
      peopleCount: 6,
      subtotal: money(286000),
      discountAmount: money(0),
      totalAmount: money(286000),
    },
  })

  for (const item of [
    { id: 'seed-order-item-001', product: products[4], quantity: 3, total: 75000 },
    { id: 'seed-order-item-002', product: products[3], quantity: 1, total: 39000 },
    { id: 'seed-order-item-003', product: products[5], quantity: 1, total: 45000 },
    { id: 'seed-order-item-004', product: products[7], quantity: 2, total: 58000 },
    { id: 'seed-order-item-005', product: products[6], quantity: 1, total: 30000 },
  ]) {
    await prisma.orderItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        orderId: order.id,
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price,
        totalPrice: money(item.total),
        status: 'SERVED',
      },
    })
  }

  const invoice = await prisma.invoice.upsert({
    where: { code: 'HD000001' },
    update: {},
    create: {
      code: 'HD000001',
      orderId: order.id,
      cashierId: cashier.id,
      promotionId: promotion.id,
      subtotal: money(286000),
      discountAmount: money(0),
      totalAmount: money(286000),
      status: 'UNPAID',
      issuedAt: new Date('2026-06-26T08:30:00+07:00'),
    },
  })

  await prisma.invoicePayment.upsert({
    where: { id: 'seed-payment-001' },
    update: {},
    create: {
      id: 'seed-payment-001',
      invoiceId: invoice.id,
      method: 'CASH',
      amount: money(286000),
      note: 'Sample cash payment',
    },
  })

  await Promise.all([
    prisma.financeTransaction.upsert({
      where: { code: 'PT001' },
      update: {},
      create: {
        code: 'PT001',
        type: 'RECEIPT',
        content: 'Thu tien ban hang ca sang',
        amount: money(2450000),
        createdById: cashier.id,
      },
    }),
    prisma.financeTransaction.upsert({
      where: { code: 'PC001' },
      update: {},
      create: {
        code: 'PC001',
        type: 'EXPENSE',
        content: 'Chi mua nguyen lieu ca phe',
        amount: money(500000),
        createdById: cashier.id,
      },
    }),
  ])
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
