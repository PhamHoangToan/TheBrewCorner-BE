import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { CashSessionsService } from './cash-sessions.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('CashSessionsService', () => {
  let service: CashSessionsService
  let prisma: any

  // Giả lập các aggregate tiền mặt: thu 200k, hoàn 20k, thu thủ công 0, chi thủ công 30k
  const mockAggregates = () => {
    prisma.invoicePayment.aggregate.mockResolvedValue({ _sum: { amount: 200000 } })
    prisma.invoiceRefund.aggregate.mockResolvedValue({ _sum: { amount: 20000 } })
    prisma.financeTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } }) // RECEIPT
      .mockResolvedValueOnce({ _sum: { amount: 30000 } }) // EXPENSE
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashSessionsService,
        {
          provide: PrismaService,
          useValue: {
            cashSession: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn((args: any) => Promise.resolve({ id: 'cs-1', ...args.data })),
              update: jest.fn((args: any) => Promise.resolve({ id: 'cs-1', ...args.data })),
            },
            invoicePayment: { aggregate: jest.fn() },
            invoiceRefund: { aggregate: jest.fn() },
            financeTransaction: { aggregate: jest.fn() },
          },
        },
      ],
    }).compile()
    service = module.get(CashSessionsService)
    prisma = module.get(PrismaService)
  })

  it('open() báo lỗi nếu đã có ca đang mở', async () => {
    prisma.cashSession.findFirst.mockResolvedValue({ id: 'cs-open' })
    await expect(service.open({ userId: 'u1', openingFloat: 100000 })).rejects.toThrow(BadRequestException)
  })

  it('open() tạo ca mới với tiền đầu ca', async () => {
    prisma.cashSession.findFirst.mockResolvedValue(null)
    const res = await service.open({ userId: 'u1', openingFloat: 100000 })
    expect(prisma.cashSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', openingFloat: 100000 }) }),
    )
    expect(res.openingFloat).toBe(100000)
  })

  it('current() trả null nếu chưa mở ca', async () => {
    prisma.cashSession.findFirst.mockResolvedValue(null)
    expect(await service.current('u1')).toBeNull()
  })

  it('current() tính expectedCash = đầu ca + (thu - hoàn + thu thủ công - chi thủ công)', async () => {
    prisma.cashSession.findFirst.mockResolvedValue({ id: 'cs-1', openingFloat: 100000, openedAt: new Date() })
    mockAggregates()
    const res: any = await service.current('u1')
    // 100000 + (200000 - 20000 + 0 - 30000) = 250000
    expect(res.expectedCash).toBe(250000)
    expect(res.cashPayments).toBe(200000)
    expect(res.cashRefunds).toBe(20000)
  })

  it('close() ghi chênh lệch = tiền đếm - tiền kỳ vọng', async () => {
    prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs-1', status: 'OPEN', openingFloat: 100000, openedAt: new Date() })
    mockAggregates()
    // expected = 250000; đếm thực 240000 → thiếu 10000
    const res: any = await service.close('cs-1', { countedCash: 240000 })
    expect(res.status).toBe('CLOSED')
    expect(res.expectedCash).toBe(250000)
    expect(res.countedCash).toBe(240000)
    expect(res.difference).toBe(-10000)
  })

  it('close() báo lỗi nếu ca đã đóng', async () => {
    prisma.cashSession.findUnique.mockResolvedValue({ id: 'cs-1', status: 'CLOSED', openingFloat: 0, openedAt: new Date() })
    await expect(service.close('cs-1', { countedCash: 0 })).rejects.toThrow(BadRequestException)
  })
})
