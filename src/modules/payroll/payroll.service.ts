import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { AttendanceService } from '../attendance/attendance.service'
import { NotificationsService } from '../notifications/notifications.service'
import { pagination, QueryParams } from '../../common/crud.types'

const STANDARD_DAYS = 26   // ngày công chuẩn / tháng
const MIN_OT_MINUTES = 15  // OT tối thiểu mới tính

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceService: AttendanceService,
    private readonly notifications: NotificationsService,
  ) {}

  // Tính lương 1 nhân viên cho 1 tháng
  async calculateForUser(userId: string, year: number, month: number): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.status === 'INACTIVE') return

    const penaltyConfig = await this.attendanceService.getPenaltyConfig()
    const existing = await this.prisma.payroll.findUnique({
      where: { userId_periodYear_periodMonth: { userId, periodYear: year, periodMonth: month } },
    })
    const existingPaidLeaveDays = Number(existing?.paidLeaveDays ?? 0)
    let paidLeaveDaysAvailable = Number(user.paidLeaveDaysLeft ?? 0) + existingPaidLeaveDays

    // Dùng UTC để tránh lệch ngày do timezone (UTC+7 làm startDate/endDate bị lùi 7h)
    const startDate = new Date(Date.UTC(year, month - 1, 1))
    const endDate   = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

    const [assignments, logs] = await Promise.all([
      this.prisma.shiftAssignment.findMany({
        where: { userId, workDate: { gte: startDate, lte: endDate } },
        include: { shift: true },
        orderBy: { workDate: 'asc' },
      }),
      this.prisma.attendanceLog.findMany({
        where: { userId, workDate: { gte: startDate, lte: endDate } },
      }),
    ])

    const logMap = new Map(
      logs.map((l) => [l.workDate.toISOString().split('T')[0], l]),
    )
    const matchedLogDates = new Set<string>()

    let workedDays = 0, paidLeaveDays = 0, absentDays = 0
    let totalMinutes = 0, otMinutes = 0, totalPenalty = 0
    const dayRecords: any[] = []

    for (const assignment of assignments) {
      const dateKey = assignment.workDate.toISOString().split('T')[0]
      const log = logMap.get(dateKey)
      const schIn  = this.timeToMinutes(assignment.shift.startTime)
      const schOut = this.timeToMinutes(assignment.shift.endTime)

      // Full-time chỉ được tính nghỉ phép khi ca nghỉ có note dùng phép.
      if (assignment.status === 'ABSENT' || !log?.checkIn) {
        if (user.employmentType === 'FULL_TIME' && this.usesPaidLeave(assignment.note) && paidLeaveDaysAvailable > 0) {
          paidLeaveDaysAvailable--
          paidLeaveDays++
          dayRecords.push({ workDate: assignment.workDate, scheduledIn: assignment.shift.startTime, scheduledOut: assignment.shift.endTime, dayType: 'PAID_LEAVE', workedMinutes: 0, otMinutes: 0, lateMinutes: 0, earlyMinutes: 0, penaltyAmount: 0 })
        } else {
          absentDays++
          dayRecords.push({ workDate: assignment.workDate, scheduledIn: assignment.shift.startTime, scheduledOut: assignment.shift.endTime, dayType: 'ABSENT', workedMinutes: 0, otMinutes: 0, lateMinutes: 0, earlyMinutes: 0, penaltyAmount: 0 })
        }
        continue
      }

      matchedLogDates.add(dateKey)
      const actualIn  = this.minutesOfDay(log.checkIn)
      const actualOut = log.checkOut ? this.minutesOfDay(log.checkOut) : schOut
      const workedMins = Math.max(0, actualOut - actualIn)

      // OT: vượt giờ ra ca, tối thiểu MIN_OT_MINUTES
      const rawOt = Math.max(0, actualOut - schOut)
      const dayOt = rawOt >= MIN_OT_MINUTES ? rawOt : 0

      // Đi trễ / về sớm
      const late  = Math.max(0, actualIn - schIn - penaltyConfig.lateGraceMinutes)
      const early = log.checkOut
        ? Math.max(0, schOut - Number(penaltyConfig.earlyGraceMinutes) - actualOut)
        : 0
      const dayPenalty =
        late * Number(penaltyConfig.penaltyPerMinuteLate) +
        early * Number(penaltyConfig.penaltyPerMinuteEarly)

      workedDays++
      totalMinutes += workedMins
      otMinutes    += dayOt
      totalPenalty += dayPenalty

      dayRecords.push({
        workDate: assignment.workDate,
        scheduledIn: assignment.shift.startTime,
        scheduledOut: assignment.shift.endTime,
        actualIn: log.checkIn,
        actualOut: log.checkOut,
        workedMinutes: workedMins,
        otMinutes: dayOt,
        lateMinutes: late,
        earlyMinutes: early,
        penaltyAmount: dayPenalty,
        dayType: 'WORK',
      })
    }

    // Tính thêm các log chấm công không có shift assignment tương ứng
    for (const log of logs) {
      if (!log.checkIn) continue
      const dateKey = log.workDate.toISOString().split('T')[0]
      if (matchedLogDates.has(dateKey)) continue   // đã xử lý ở vòng trên

      const actualIn  = this.minutesOfDay(log.checkIn)
      // Nếu không có checkout → mặc định 8 tiếng
      const actualOut = log.checkOut ? this.minutesOfDay(log.checkOut) : actualIn + 480
      const workedMins = Math.max(0, actualOut - actualIn)

      workedDays++
      totalMinutes += workedMins

      dayRecords.push({
        workDate: log.workDate,
        scheduledIn: null,
        scheduledOut: null,
        actualIn: log.checkIn,
        actualOut: log.checkOut,
        workedMinutes: workedMins,
        otMinutes: 0,
        lateMinutes: 0,
        earlyMinutes: 0,
        penaltyAmount: 0,
        dayType: 'WORK',
      })
    }

    // Tính tổng lương
    const baseSalary = Number(user.baseSalary)
    const otRatePerHour = Number(user.otRatePerHour)
    const otHours = otMinutes / 60
    const otAmount = otHours * otRatePerHour
    const totalHours = totalMinutes / 60

    let totalAmount = 0
    if (user.employmentType === 'FULL_TIME') {
      const dailyRate = baseSalary / STANDARD_DAYS
      const unpaidLeaveDeduction = absentDays * dailyRate
      totalAmount = baseSalary + otAmount - unpaidLeaveDeduction - totalPenalty
    } else {
      // PART_TIME: lương theo giờ thực làm
      totalAmount = totalHours * baseSalary + otAmount - totalPenalty
    }
    totalAmount = Math.max(0, totalAmount)

    // Upsert Payroll
    if (existing) {
      await this.prisma.payrollDay.deleteMany({ where: { payrollId: existing.id } })
      await this.prisma.payroll.update({
        where: { id: existing.id },
        data: {
          employmentType: user.employmentType,
          baseSalary,
          scheduledDays: assignments.length,
          workedDays,
          paidLeaveDays,
          absentDays,
          totalHours,
          otHours,
          otAmount,
          penaltyAmount: totalPenalty,
          totalAmount,
          status: 'DRAFT',
          days: { create: dayRecords },
        },
      })
    } else {
      await this.prisma.payroll.create({
        data: {
          userId,
          periodYear: year,
          periodMonth: month,
          employmentType: user.employmentType,
          baseSalary,
          scheduledDays: assignments.length,
          workedDays,
          paidLeaveDays,
          absentDays,
          totalHours,
          otHours,
          otAmount,
          penaltyAmount: totalPenalty,
          totalAmount,
          days: { create: dayRecords },
        },
      })
    }

    const paidLeaveDelta = paidLeaveDays - existingPaidLeaveDays
    if (paidLeaveDelta > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { paidLeaveDaysLeft: { decrement: paidLeaveDelta } },
      })
    } else if (paidLeaveDelta < 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { paidLeaveDaysLeft: { increment: Math.abs(paidLeaveDelta) } },
      })
    }
  }

  // Tính lương toàn bộ nhân viên cho 1 tháng
  async calculateMonth(year: number, month: number) {
    const users = await this.prisma.user.findMany({
      where: { status: { not: 'INACTIVE' }, role: { not: 'CUSTOMER' } },
      select: { id: true },
    })
    for (const u of users) {
      try {
        await this.calculateForUser(u.id, year, month)
      } catch (err) {
        console.error(`[Payroll] Error for user ${u.id}:`, (err as any)?.message)
      }
    }
    await this.notifications.send({
      role: 'admin',
      title: '💰 Bảng lương đã sẵn sàng',
      body: `Bảng lương tháng ${month}/${year} đã được tính xong`,
      type: 'PAYROLL_READY',
      refId: `${year}-${month}`,
    })
    return { computed: users.length, year, month }
  }

  async findAll(query: QueryParams & { year?: string; month?: string }) {
    const { skip, take, page, limit } = pagination(query)
    const where: Record<string, any> = {}
    if (query.year) where.periodYear = Number(query.year)
    if (query.month) where.periodMonth = Number(query.month)

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payroll.findMany({
        where,
        skip,
        take,
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        include: { user: { select: { id: true, code: true, name: true, role: true, employmentType: true } } },
      }),
      this.prisma.payroll.count({ where }),
    ])
    return { items, total, page, limit }
  }

  async findByUser(userId: string) {
    return this.prisma.payroll.findMany({
      where: { userId },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      include: { user: { select: { id: true, code: true, name: true, role: true } } },
    })
  }

  async findOne(id: string) {
    return this.prisma.payroll.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, code: true, name: true, role: true, employmentType: true, baseSalary: true, otRatePerHour: true } },
        days: { orderBy: { workDate: 'asc' } },
      },
    })
  }

  async findOneByUserMonth(userId: string, year: number, month: number) {
    return this.prisma.payroll.findUnique({
      where: { userId_periodYear_periodMonth: { userId, periodYear: year, periodMonth: month } },
      include: {
        user: { select: { id: true, code: true, name: true, role: true, employmentType: true, baseSalary: true, otRatePerHour: true } },
        days: { orderBy: { workDate: 'asc' } },
      },
    })
  }

  async approve(id: string) {
    return this.prisma.payroll.update({ where: { id }, data: { status: 'APPROVED' } })
  }

  async markPaid(id: string) {
    return this.prisma.payroll.update({ where: { id }, data: { status: 'PAID' } })
  }

  async setSalaryConfig(
    userId: string,
    body: { employmentType?: string; baseSalary?: number; otRatePerHour?: number; paidLeaveDaysLeft?: number },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        employmentType: (body.employmentType as any) ?? undefined,
        baseSalary: body.baseSalary ?? undefined,
        otRatePerHour: body.otRatePerHour ?? undefined,
        paidLeaveDaysLeft: body.paidLeaveDaysLeft ?? undefined,
      },
      select: { id: true, name: true, employmentType: true, baseSalary: true, otRatePerHour: true, paidLeaveDaysLeft: true },
    })
  }

  // ── helpers ──────────────────────────────────────────────────────
  private timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }

  private minutesOfDay(dt: Date): number {
    return dt.getHours() * 60 + dt.getMinutes()
  }

  private usesPaidLeave(note?: string | null): boolean {
    const normalized = String(note ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    return normalized.includes('phep') || normalized.includes('paid leave') || /\bleave\b/.test(normalized)
  }
}
