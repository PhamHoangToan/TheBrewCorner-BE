import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { pagination, QueryParams } from '../../common/crud.types'
import { AttendanceService } from '../attendance/attendance.service'
import { mentionsPaidLeave } from '../../common/leave-note.util'
import { isFutureDate } from '../../common/date.util'

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
  ) {}

  async findAll(query: QueryParams) {
    const { skip, take, page, limit } = pagination(query)
    const where = { deletedAt: null }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shift.findMany({ where, skip, take, orderBy: { code: 'asc' } }),
      this.prisma.shift.count({ where }),
    ])
    return { items, total, page, limit }
  }

  create(body: Record<string, any>) {
    return this.prisma.shift.create({
      data: {
        code: body.code ?? `CA-${Date.now()}`,
        name: body.name ?? body.calamviec ?? body.ten,
        startTime: body.startTime ?? body.gioVao ?? '06:00',
        endTime: body.endTime ?? body.gioRa ?? '14:00',
        isActive: body.isActive ?? true,
      },
    })
  }

  update(id: string, body: Record<string, any>) {
    return this.prisma.shift.update({
      where: { id },
      data: {
        code: body.code,
        name: body.name ?? body.calamviec ?? body.ten,
        startTime: body.startTime ?? body.gioVao,
        endTime: body.endTime ?? body.gioRa,
        isActive: body.isActive,
      },
    })
  }

  async remove(id: string) {
    await this.prisma.shift.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  async assignments(query: QueryParams & { userId?: string; month?: string; year?: string }) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = { deletedAt: null }
    if (query.userId) where.userId = query.userId
    if (query.month && query.year) {
      const m = Number(query.month)
      const y = Number(query.year)
      where.workDate = {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
      }
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shiftAssignment.findMany({
        where,
        skip,
        take,
        orderBy: { workDate: 'desc' },
        include: { user: true, shift: true },
      }),
      this.prisma.shiftAssignment.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async updateAssignment(id: string, body: Record<string, any>) {
    const userId = body.userId ?? (body.nhanVien ? await this.findUserId(body.nhanVien) : undefined)
    const shiftId = body.shiftId ?? (body.gioVao || body.gioRa ? await this.findOrCreateShift(body) : undefined)
    const status = body.status ? this.shiftStatus(body.status) : undefined
    return this.prisma.shiftAssignment.update({
      where: { id },
      data: {
        ...(userId ? { userId } : {}),
        ...(shiftId ? { shiftId } : {}),
        ...(body.workDate ?? body.ngay ? { workDate: new Date(body.workDate ?? body.ngay) } : {}),
        ...(status ? { status } : {}),
        note: body.note,
      },
      include: { user: true, shift: true },
    })
  }

  private shiftStatus(value: string) {
    const map: Record<string, any> = {
      SCHEDULED: 'SCHEDULED', 'Lên lịch': 'SCHEDULED',
      IN_PROGRESS: 'IN_PROGRESS', 'Đang làm': 'IN_PROGRESS',
      COMPLETED: 'COMPLETED', 'Hoàn thành': 'COMPLETED',
      ABSENT: 'ABSENT', 'Vắng mặt': 'ABSENT',
    }
    return map[value] ?? 'SCHEDULED'
  }

  async removeAssignment(id: string) {
    await this.prisma.shiftAssignment.update({ where: { id }, data: { deletedAt: new Date() } })
    return { deleted: true }
  }

  async createAssignment(body: Record<string, any>) {
    const userId = body.userId ?? (await this.findUserId(body.nhanVien))
    const shiftId = body.shiftId ?? (await this.findOrCreateShift(body))
    const shift = await this.prisma.shift.findUniqueOrThrow({ where: { id: shiftId } })
    const workDate = new Date(body.workDate ?? body.ngay ?? new Date())
    const isLeave = this.isLeaveOrAbsent(body)
    const isFuture = isFutureDate(workDate)

    const status = isFuture ? 'SCHEDULED' : isLeave ? 'ABSENT' : 'COMPLETED'

    const assignment = await this.prisma.shiftAssignment.create({
      data: {
        userId,
        shiftId,
        workDate,
        status,
        note: body.note ?? null,
      },
      include: { user: true, shift: true },
    })

    // Chỉ tự tạo chấm công cho ca đã/đang diễn ra (không phải ngày trong tương lai)
    // và không phải ca nghỉ phép/vắng mặt.
    if (!isFuture && !isLeave) {
      await this.attendanceService.createManual({
        userId,
        workDate: workDate.toISOString(),
        checkIn: this.combineDateTime(workDate, shift.startTime),
        checkOut: this.combineDateTime(workDate, shift.endTime),
        note: 'Tự động từ ca làm việc',
      })
    }

    return assignment
  }

  private isLeaveOrAbsent(body: Record<string, any>): boolean {
    const status = String(body.status ?? '').toLowerCase()
    return status === 'absent' || status === 'vắng mặt'.toLowerCase() || mentionsPaidLeave(body.note)
  }

  private combineDateTime(workDate: Date, hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number)
    const dt = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), h, m))
    return dt.toISOString()
  }

  private async findUserId(nameOrId: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
    })
    if (user) return user.id
    const created = await this.prisma.user.create({
      data: {
        code: `NV-${Date.now()}`,
        name: nameOrId ?? 'Nhan vien',
        passwordHash: 'dev-password-change-me',
        role: 'WAITER',
      },
    })
    return created.id
  }

  private async findOrCreateShift(body: Record<string, any>) {
    const startTime = body.startTime ?? body.gioVao ?? '06:00'
    const endTime = body.endTime ?? body.gioRa ?? '14:00'
    const code = `${startTime}-${endTime}`.replace(/[^0-9]/g, '')
    const shift = await this.prisma.shift.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: body.calamviec ?? `${startTime}-${endTime}`,
        startTime,
        endTime,
      },
    })
    return shift.id
  }
}
