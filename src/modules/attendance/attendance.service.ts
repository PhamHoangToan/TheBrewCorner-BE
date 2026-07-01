import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // Được gọi từ máy chấm công (webhook) — tự phân loại check-in / check-out
  async recordFromDevice(params: { employeeCode: string; timestamp: Date; source?: string; note?: string }) {
    const user = await this.prisma.user.findFirst({ where: { code: params.employeeCode } })
    if (!user) throw new NotFoundException(`Nhân viên ${params.employeeCode} không tồn tại`)

    const workDate = this.toDateOnly(params.timestamp)
    const existing = await this.prisma.attendanceLog.findFirst({
      where: { userId: user.id, workDate },
      orderBy: { createdAt: 'asc' },
    })

    if (!existing) {
      return this.prisma.attendanceLog.create({
        data: {
          userId: user.id,
          checkIn: params.timestamp,
          workDate,
          source: params.source ?? 'FACE',
          note: params.note,
        },
      })
    }

    // Bản ghi đã tồn tại → cập nhật check-out (lần cuối trong ngày)
    return this.prisma.attendanceLog.update({
      where: { id: existing.id },
      data: { checkOut: params.timestamp },
    })
  }

  // Nhập thủ công từ admin
  async createManual(body: {
    userId: string
    checkIn: string
    checkOut?: string
    workDate: string
    note?: string
  }) {
    const workDate = new Date(body.workDate)
    await this.prisma.attendanceLog.deleteMany({ where: { userId: body.userId, workDate } })
    return this.prisma.attendanceLog.create({
      data: {
        userId: body.userId,
        checkIn: new Date(body.checkIn),
        checkOut: body.checkOut ? new Date(body.checkOut) : null,
        workDate,
        source: 'MANUAL',
        note: body.note,
      },
      include: { user: { select: { id: true, name: true, code: true } } },
    })
  }

  async update(id: string, body: { checkIn?: string; checkOut?: string; note?: string }) {
    return this.prisma.attendanceLog.update({
      where: { id },
      data: {
        checkIn: body.checkIn ? new Date(body.checkIn) : undefined,
        checkOut: body.checkOut ? new Date(body.checkOut) : null,
        note: body.note,
      },
    })
  }

  async findAll(query: QueryParams & { userId?: string; month?: string; year?: string }) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.userId) where.userId = query.userId
    if (query.month && query.year) {
      const m = Number(query.month)
      const y = Number(query.year)
      where.workDate = {
        gte: new Date(y, m - 1, 1),
        lte: new Date(y, m, 0),
      }
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceLog.findMany({
        where,
        skip,
        take,
        orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
        include: { user: { select: { id: true, name: true, code: true, role: true } } },
      }),
      this.prisma.attendanceLog.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async remove(id: string) {
    await this.prisma.attendanceLog.delete({ where: { id } })
    return { deleted: true }
  }

  async getPenaltyConfig() {
    let config = await this.prisma.penaltyConfig.findFirst()
    if (!config) {
      config = await this.prisma.penaltyConfig.create({
        data: { lateGraceMinutes: 5, penaltyPerMinuteLate: 0, earlyGraceMinutes: 5, penaltyPerMinuteEarly: 0 },
      })
    }
    return config
  }

  async updatePenaltyConfig(body: {
    lateGraceMinutes?: number
    penaltyPerMinuteLate?: number
    earlyGraceMinutes?: number
    penaltyPerMinuteEarly?: number
  }) {
    const config = await this.getPenaltyConfig()
    return this.prisma.penaltyConfig.update({
      where: { id: config.id },
      data: {
        lateGraceMinutes: body.lateGraceMinutes ?? config.lateGraceMinutes,
        penaltyPerMinuteLate: body.penaltyPerMinuteLate ?? config.penaltyPerMinuteLate,
        earlyGraceMinutes: body.earlyGraceMinutes ?? config.earlyGraceMinutes,
        penaltyPerMinuteEarly: body.penaltyPerMinuteEarly ?? config.penaltyPerMinuteEarly,
      },
    })
  }

  // ── Yêu cầu bổ sung chấm công (nhân viên gửi khi quên chấm công) ──────────
  async createCorrection(body: { userId: string; workDate: string; checkIn?: string; checkOut?: string; reason: string }) {
    return this.prisma.attendanceCorrectionRequest.create({
      data: {
        userId: body.userId,
        workDate: new Date(body.workDate),
        checkIn: body.checkIn ? new Date(body.checkIn) : null,
        checkOut: body.checkOut ? new Date(body.checkOut) : null,
        reason: body.reason,
      },
    })
  }

  async findCorrections(query: QueryParams & { userId?: string; status?: string }) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.userId) where.userId = query.userId
    if (query.status) where.status = query.status
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceCorrectionRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, code: true, role: true } } },
      }),
      this.prisma.attendanceCorrectionRequest.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async approveCorrection(id: string) {
    const request = await this.prisma.attendanceCorrectionRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu bổ sung chấm công')
    if (request.status !== 'PENDING') throw new BadRequestException('Yêu cầu đã được xử lý')

    await this.createManual({
      userId: request.userId,
      workDate: request.workDate.toISOString(),
      checkIn: (request.checkIn ?? request.workDate).toISOString(),
      checkOut: request.checkOut ? request.checkOut.toISOString() : undefined,
      note: 'Bổ sung chấm công',
    })

    // Đồng bộ lại ShiftAssignment của ngày đó (đang "Vắng mặt") sang "Hoàn thành"
    // để trang Shift/Attendance bên admin phản ánh đúng đã có chấm công.
    await this.prisma.shiftAssignment.updateMany({
      where: { userId: request.userId, workDate: request.workDate },
      data: { status: 'COMPLETED' },
    })

    return this.prisma.attendanceCorrectionRequest.update({
      where: { id },
      data: { status: 'APPROVED', decidedAt: new Date() },
    })
  }

  async rejectCorrection(id: string, reason: string) {
    const request = await this.prisma.attendanceCorrectionRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu bổ sung chấm công')
    if (request.status !== 'PENDING') throw new BadRequestException('Yêu cầu đã được xử lý')

    return this.prisma.attendanceCorrectionRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: reason, decidedAt: new Date() },
    })
  }

  private toDateOnly(dt: Date): Date {
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
  }
}
