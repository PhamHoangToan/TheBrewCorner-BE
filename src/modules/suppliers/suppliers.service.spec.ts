import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { SuppliersService } from './suppliers.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('SuppliersService', () => {
  let service: SuppliersService
  let prisma: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        {
          provide: PrismaService,
          useValue: {
            supplier: {
              findMany: jest.fn(),
              count: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            stockImport: { aggregate: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile()

    service = module.get(SuppliersService)
    prisma = module.get(PrismaService)
  })

  describe('findAll', () => {
    it('lọc deletedAt null mặc định, không search', async () => {
      prisma.$transaction.mockResolvedValue([[], 0])
      await service.findAll({})
      const args = prisma.$transaction.mock.calls[0][0]
      expect(args).toBeDefined()
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { deletedAt: null },
      }))
    })

    it('thêm OR tìm theo name/code khi có search', async () => {
      prisma.$transaction.mockResolvedValue([[], 0])
      await service.findAll({ search: 'ACB' })
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [{ name: { contains: 'ACB' } }, { code: { contains: 'ACB' } }],
        },
      }))
    })

    it('trả về items/total/page/limit từ $transaction', async () => {
      const items = [{ id: 's1' }]
      prisma.$transaction.mockResolvedValue([items, 1])

      const result = await service.findAll({})

      expect(result).toEqual({ items, total: 1, page: 1, limit: 20 })
    })
  })

  describe('findOne', () => {
    it('báo lỗi NotFoundException nếu không tìm thấy', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null)
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException)
    })

    it('gộp totalImports/totalImportAmount từ aggregate vào kết quả', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1', name: 'NCC A', imports: [] })
      prisma.stockImport.aggregate.mockResolvedValue({ _sum: { totalAmount: '5500000.00' }, _count: 3 })

      const result = await service.findOne('s1')

      expect(result).toMatchObject({ id: 's1', totalImports: 3, totalImportAmount: 5500000 })
    })

    it('totalImportAmount = 0 nếu chưa có lần nhập nào', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1', name: 'NCC A', imports: [] })
      prisma.stockImport.aggregate.mockResolvedValue({ _sum: { totalAmount: null }, _count: 0 })

      const result = await service.findOne('s1')

      expect(result.totalImportAmount).toBe(0)
    })
  })

  describe('create', () => {
    it('tự sinh code NCC-{timestamp} nếu không truyền code', async () => {
      prisma.supplier.create.mockResolvedValue({ id: 's1' })
      await service.create({ name: 'NCC A' })
      const call = prisma.supplier.create.mock.calls[0][0]
      expect(call.data.code).toMatch(/^NCC-\d+$/)
      expect(call.data.name).toBe('NCC A')
    })

    it('chấp nhận field "ten" thay cho "name" (tương thích cũ)', async () => {
      prisma.supplier.create.mockResolvedValue({ id: 's1' })
      await service.create({ ten: 'NCC B' })
      expect(prisma.supplier.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: 'NCC B' }),
      }))
    })
  })

  describe('remove', () => {
    it('set deletedAt thay vì xóa cứng (soft delete)', async () => {
      prisma.supplier.update.mockResolvedValue({})
      const result = await service.remove('s1')
      expect(prisma.supplier.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { deletedAt: expect.any(Date) },
      })
      expect(result).toEqual({ deleted: true })
    })
  })

  describe('findOrCreateByName', () => {
    it('trả về null nếu tên rỗng (chỉ khoảng trắng)', async () => {
      const result = await service.findOrCreateByName('   ')
      expect(result).toBeNull()
      expect(prisma.supplier.findFirst).not.toHaveBeenCalled()
    })

    it('trả về NCC đã tồn tại nếu tìm thấy theo tên (trimmed)', async () => {
      const existing = { id: 's1', name: 'Cầu Đất Farm' }
      prisma.supplier.findFirst.mockResolvedValue(existing)

      const result = await service.findOrCreateByName('  Cầu Đất Farm  ')

      expect(prisma.supplier.findFirst).toHaveBeenCalledWith({ where: { name: 'Cầu Đất Farm', deletedAt: null } })
      expect(result).toEqual(existing)
      expect(prisma.supplier.create).not.toHaveBeenCalled()
    })

    it('tự tạo NCC mới nếu chưa tồn tại theo tên', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null)
      const created = { id: 's2', name: 'Cầu Đất Farm' }
      prisma.supplier.create.mockResolvedValue(created)

      const result = await service.findOrCreateByName('Cầu Đất Farm')

      expect(prisma.supplier.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: 'Cầu Đất Farm' }),
      }))
      expect(result).toEqual(created)
    })
  })
})
