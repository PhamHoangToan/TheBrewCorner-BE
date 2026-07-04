import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Test, TestingModule } from '@nestjs/testing'
import { ShiftsService } from './shifts.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AttendanceService } from '../attendance/attendance.service'
import { NotificationsService } from '../notifications/notifications.service'

describe('ShiftsService — đăng ký / nhượng ca (ShiftChangeRequest)', () => {
  let service: ShiftsService
  let prisma: any
  let notifications: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        {
          provide: PrismaService,
          useValue: {
            shift: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), upsert: jest.fn() },
            shiftAssignment: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            shiftChangeRequest: {
              findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), count: jest.fn(),
              findUnique: jest.fn(), update: jest.fn(),
            },
            user: { findFirst: jest.fn(), create: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        { provide: AttendanceService, useValue: { createManual: jest.fn() } },
        { provide: NotificationsService, useValue: { send: jest.fn() } },
      ],
    }).compile()

    service = module.get(ShiftsService)
    prisma = module.get(PrismaService)
    notifications = module.get(NotificationsService)
  })

  describe('createRequest', () => {
    it('báo lỗi nếu thiếu userId hoặc workDate không hợp lệ', async () => {
      await expect(service.createRequest({ workDate: '2026-07-10' })).rejects.toThrow(BadRequestException)
      await expect(service.createRequest({ userId: 'u1', workDate: 'khong-hop-le' })).rejects.toThrow(BadRequestException)
    })

    it('REGISTER: báo lỗi NotFoundException nếu shift không tồn tại', async () => {
      prisma.shift.findFirst.mockResolvedValue(null)
      await expect(service.createRequest({ userId: 'u1', workDate: '2026-07-10', shiftId: 's1', type: 'REGISTER' }))
        .rejects.toThrow(NotFoundException)
    })

    it('REGISTER: báo lỗi nếu nhân viên đã được phân ca này rồi', async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: 's1' })
      prisma.shiftAssignment.findFirst.mockResolvedValue({ id: 'sa1' })
      await expect(service.createRequest({ userId: 'u1', workDate: '2026-07-10', shiftId: 's1', type: 'REGISTER' }))
        .rejects.toThrow(BadRequestException)
    })

    it('SWAP: báo lỗi NotFoundException nếu không tìm thấy assignment cần nhượng', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue(null)
      await expect(service.createRequest({
        userId: 'u1', workDate: '2026-07-10', type: 'SWAP', targetAssignmentId: 'sa1',
      })).rejects.toThrow(NotFoundException)
    })

    it('báo lỗi nếu đã có yêu cầu PENDING cho cùng ca/ngày', async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: 's1' })
      prisma.shiftAssignment.findFirst.mockResolvedValue(null)
      prisma.shiftChangeRequest.findFirst.mockResolvedValue({ id: 'req-existing', status: 'PENDING' })

      await expect(service.createRequest({ userId: 'u1', workDate: '2026-07-10', shiftId: 's1', type: 'REGISTER' }))
        .rejects.toThrow(BadRequestException)
    })

    it('tạo REGISTER request thành công', async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: 's1' })
      prisma.shiftAssignment.findFirst.mockResolvedValue(null)
      prisma.shiftChangeRequest.findFirst.mockResolvedValue(null)
      prisma.shiftChangeRequest.create.mockResolvedValue({ id: 'req-1', type: 'REGISTER' })

      const result = await service.createRequest({
        userId: 'u1', workDate: '2026-07-10', shiftId: 's1', type: 'REGISTER', reason: 'Muốn làm thêm',
      })

      expect(prisma.shiftChangeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', type: 'REGISTER', shiftId: 's1', reason: 'Muốn làm thêm' }),
      }))
      expect(result).toEqual({ id: 'req-1', type: 'REGISTER' })
    })

    it('tạo SWAP request thành công, lấy shiftId từ assignment', async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({ id: 'sa1', shiftId: 's2', userId: 'u1' })
      prisma.shiftChangeRequest.findFirst.mockResolvedValue(null)
      prisma.shiftChangeRequest.create.mockResolvedValue({ id: 'req-2', type: 'SWAP' })

      await service.createRequest({ userId: 'u1', workDate: '2026-07-10', type: 'SWAP', targetAssignmentId: 'sa1' })

      expect(prisma.shiftChangeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: 'SWAP', shiftId: 's2', targetAssignmentId: 'sa1' }),
      }))
    })

    it('cắt reason tối đa 500 ký tự', async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: 's1' })
      prisma.shiftAssignment.findFirst.mockResolvedValue(null)
      prisma.shiftChangeRequest.findFirst.mockResolvedValue(null)
      prisma.shiftChangeRequest.create.mockResolvedValue({ id: 'req-1' })
      const longReason = 'x'.repeat(600)

      await service.createRequest({ userId: 'u1', workDate: '2026-07-10', shiftId: 's1', type: 'REGISTER', reason: longReason })

      expect(prisma.shiftChangeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ reason: 'x'.repeat(500) }),
      }))
    })
  })

  describe('requests', () => {
    it('lọc theo userId và status khi có truyền', async () => {
      prisma.$transaction.mockResolvedValue([[], 0])
      await service.requests({ userId: 'u1', status: 'PENDING' })
      expect(prisma.shiftChangeRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'u1', status: 'PENDING' },
      }))
    })
  })

  describe('approveRequest', () => {
    it('báo lỗi NotFoundException nếu request không tồn tại', async () => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue(null)
      await expect(service.approveRequest('req-1')).rejects.toThrow(NotFoundException)
    })

    it('báo lỗi nếu request đã được xử lý rồi', async () => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue({ id: 'req-1', status: 'APPROVED' })
      await expect(service.approveRequest('req-1')).rejects.toThrow(BadRequestException)
    })

    it('REGISTER: tạo assignment mới rồi set APPROVED + gửi thông báo', async () => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue({
        id: 'req-1', status: 'PENDING', type: 'REGISTER', userId: 'u1', shiftId: 's1', workDate: new Date('2099-01-01'),
      })
      prisma.shift.findUniqueOrThrow.mockResolvedValue({ id: 's1', name: 'Ca sáng', startTime: '06:00', endTime: '14:00' })
      prisma.shiftAssignment.create.mockResolvedValue({
        id: 'sa1', user: { id: 'u1', role: 'WAITER' }, shift: { name: 'Ca sáng', startTime: '06:00', endTime: '14:00' },
      })
      prisma.shiftChangeRequest.update.mockResolvedValue({
        id: 'req-1', type: 'REGISTER', status: 'APPROVED',
        user: { id: 'u1', role: 'WAITER' }, shift: { name: 'Ca sáng', startTime: '06:00', endTime: '14:00' },
        workDate: new Date('2099-01-01'),
      })

      const result = await service.approveRequest('req-1')

      expect(prisma.shiftAssignment.create).toHaveBeenCalled()
      expect(prisma.shiftChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'req-1' },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }))
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'u1', type: 'SHIFT_REQUEST_APPROVED',
      }))
      expect(result.status).toBe('APPROVED')
    })

    it('REGISTER: báo lỗi thân thiện nếu assignment đã tồn tại (P2002 conflict)', async () => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue({
        id: 'req-1', status: 'PENDING', type: 'REGISTER', userId: 'u1', shiftId: 's1', workDate: new Date('2099-01-01'),
      })
      prisma.shift.findUniqueOrThrow.mockResolvedValue({ id: 's1', name: 'Ca sáng', startTime: '06:00', endTime: '14:00' })
      prisma.shiftAssignment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2002', clientVersion: '5.0.0' }),
      )

      await expect(service.approveRequest('req-1')).rejects.toThrow(BadRequestException)
    })

    it('SWAP: đánh dấu ABSENT + ghi chú "cần phân người thay" (không xóa mềm) rồi set APPROVED', async () => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue({
        id: 'req-1', status: 'PENDING', type: 'SWAP', userId: 'u1', shiftId: 's1',
        workDate: new Date('2099-01-01'), targetAssignmentId: 'sa-old',
      })
      prisma.shiftAssignment.findUnique.mockResolvedValue({ id: 'sa-old', note: null })
      prisma.shiftAssignment.update.mockResolvedValue({})
      prisma.shiftChangeRequest.update.mockResolvedValue({
        id: 'req-1', type: 'SWAP', status: 'APPROVED',
        user: { id: 'u1', role: 'WAITER' }, shift: { name: 'Ca sáng' }, workDate: new Date('2099-01-01'),
      })

      await service.approveRequest('req-1')

      expect(prisma.shiftAssignment.update).toHaveBeenCalledWith({
        where: { id: 'sa-old' },
        data: { status: 'ABSENT', note: 'Đã nhượng ca — cần phân người thay' },
      })
      expect(prisma.shiftAssignment.create).not.toHaveBeenCalled()
    })
  })

  describe('rejectRequest', () => {
    it('báo lỗi NotFoundException nếu request không tồn tại', async () => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue(null)
      await expect(service.rejectRequest('req-1', 'Không đủ người')).rejects.toThrow(NotFoundException)
    })

    it('báo lỗi nếu request đã được xử lý rồi', async () => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue({ id: 'req-1', status: 'REJECTED' })
      await expect(service.rejectRequest('req-1', 'lý do')).rejects.toThrow(BadRequestException)
    })

    it('set REJECTED kèm rejectReason và gửi thông báo cho nhân viên', async () => {
      prisma.shiftChangeRequest.findUnique.mockResolvedValue({ id: 'req-1', status: 'PENDING' })
      prisma.shiftChangeRequest.update.mockResolvedValue({
        id: 'req-1', type: 'REGISTER', status: 'REJECTED',
        user: { id: 'u1', role: 'BARISTA' }, shift: { name: 'Ca sáng' }, workDate: new Date('2099-01-01'),
      })

      await service.rejectRequest('req-1', 'Không đủ người')

      expect(prisma.shiftChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'req-1' },
        data: expect.objectContaining({ status: 'REJECTED', rejectReason: 'Không đủ người' }),
      }))
      expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'u1', type: 'SHIFT_REQUEST_REJECTED',
      }))
    })
  })
})
