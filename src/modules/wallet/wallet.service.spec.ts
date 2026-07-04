import { BadRequestException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { WalletService } from './wallet.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('WalletService', () => {
  let service: WalletService
  let prisma: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: {
            wallet: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            walletTransaction: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn() },
            pendingTransfer: { findUnique: jest.fn(), update: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile()
    service = module.get(WalletService)
    prisma = module.get(PrismaService)
  })

  it('getOrCreate tạo ví nếu chưa có', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null)
    prisma.wallet.create.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 0 })
    const w = await service.getOrCreate('u1')
    expect(prisma.wallet.create).toHaveBeenCalled()
    expect(w.id).toBe('w1')
  })

  it('debit báo lỗi nếu số dư không đủ', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 30000 })
    await expect(service.debit('u1', 50000)).rejects.toThrow(BadRequestException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('debit trừ ví khi đủ số dư', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 100000 })
    await service.debit('u1', 40000, 'order-1', 'Trả đơn')
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('topupFromPending báo lỗi nếu chưa nhận tiền', async () => {
    prisma.pendingTransfer.findUnique.mockResolvedValue({ code: 'CK-1', status: 'WAITING', amount: 100000 })
    await expect(service.topupFromPending('u1', 'CK-1')).rejects.toThrow(BadRequestException)
  })

  it('topupFromPending idempotent — đã nạp thì không cộng lại', async () => {
    prisma.pendingTransfer.findUnique.mockResolvedValue({ code: 'CK-1', status: 'PAID', amount: 100000 })
    prisma.walletTransaction.findFirst.mockResolvedValue({ id: 'existing' })
    prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', userId: 'u1', balance: 100000 })
    await service.topupFromPending('u1', 'CK-1')
    expect(prisma.pendingTransfer.update).not.toHaveBeenCalled()
  })
})
