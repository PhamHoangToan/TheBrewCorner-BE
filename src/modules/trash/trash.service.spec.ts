import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { TrashService } from './trash.service'
import { PrismaService } from '../../prisma/prisma.service'

describe('TrashService', () => {
  let service: TrashService
  let prisma: any

  beforeEach(async () => {
    const delegate = () => ({ findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrashService,
        {
          provide: PrismaService,
          useValue: {
            user: delegate(),
            product: delegate(),
            category: delegate(),
            ingredient: delegate(),
            promotion: delegate(),
            area: delegate(),
            cafeTable: delegate(),
            shift: delegate(),
            shiftAssignment: delegate(),
            order: delegate(),
            invoice: delegate(),
            financeTransaction: delegate(),
            attendanceLog: delegate(),
            supplier: delegate(),
          },
        },
      ],
    }).compile()

    service = module.get(TrashService)
    prisma = module.get(PrismaService)
  })

  describe('types', () => {
    it('trả về danh sách 14 loại model hỗ trợ soft delete', () => {
      const types = service.types()
      expect(types).toContain('users')
      expect(types).toContain('suppliers')
      expect(types).toHaveLength(14)
    })
  })

  describe('findAll', () => {
    it('báo lỗi BadRequestException nếu type không hợp lệ', async () => {
      await expect(service.findAll('khong-ton-tai')).rejects.toThrow(BadRequestException)
    })

    it('query đúng model tương ứng, lọc deletedAt not null, sắp xếp deletedAt desc', async () => {
      const items = [{ id: 'p1', deletedAt: new Date() }]
      prisma.product.findMany.mockResolvedValue(items)

      const result = await service.findAll('products')

      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        take: 200,
      })
      expect(result).toEqual({ items, total: 1 })
    })

    it('map đúng type "shift-assignments" sang model shiftAssignment', async () => {
      prisma.shiftAssignment.findMany.mockResolvedValue([])
      await service.findAll('shift-assignments')
      expect(prisma.shiftAssignment.findMany).toHaveBeenCalled()
    })

    it('map đúng type "suppliers" sang model supplier', async () => {
      prisma.supplier.findMany.mockResolvedValue([])
      await service.findAll('suppliers')
      expect(prisma.supplier.findMany).toHaveBeenCalled()
    })
  })

  describe('restore', () => {
    it('báo lỗi BadRequestException nếu type không hợp lệ', async () => {
      await expect(service.restore('khong-ton-tai', 'id-1')).rejects.toThrow(BadRequestException)
    })

    it('báo lỗi NotFoundException nếu bản ghi không tồn tại hoặc chưa bị xóa', async () => {
      prisma.category.findFirst.mockResolvedValue(null)
      await expect(service.restore('categories', 'cat-1')).rejects.toThrow(NotFoundException)
      expect(prisma.category.update).not.toHaveBeenCalled()
    })

    it('set deletedAt = null khi bản ghi tồn tại và đã bị xóa', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'cat-1', deletedAt: new Date() })
      prisma.category.update.mockResolvedValue({ id: 'cat-1', deletedAt: null })

      const result = await service.restore('categories', 'cat-1')

      expect(prisma.category.findFirst).toHaveBeenCalledWith({ where: { id: 'cat-1', deletedAt: { not: null } } })
      expect(prisma.category.update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data: { deletedAt: null } })
      expect(result).toEqual({ restored: true })
    })
  })
})
