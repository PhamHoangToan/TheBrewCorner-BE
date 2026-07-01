import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

const USER_CODE = 'NV004'
const SHIFT_CODE = 'CA1' // Ca 1 (6h-14h)
const YEAR = 2026
const MONTH = 6 // June

// 1 ngày nghỉ phép đã dùng, 2 ngày quên chấm công (chờ duyệt bổ sung)
const LEAVE_DAY = 10
const MISSED_DAYS = [3, 17]

const dateOnly = (day: number) => new Date(Date.UTC(YEAR, MONTH - 1, day))
const atTime = (day: number, hh: number, mm: number) => new Date(Date.UTC(YEAR, MONTH - 1, day, hh, mm))

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { code: USER_CODE } })
  const shift = await prisma.shift.findUniqueOrThrow({ where: { code: SHIFT_CODE } })

  await prisma.user.update({
    where: { id: user.id },
    data: { baseSalary: new Prisma.Decimal(8_000_000), paidLeaveDaysLeft: 11 }, // trừ 1 ngày đã dùng
  })

  const daysInMonth = new Date(YEAR, MONTH, 0).getDate()
  const workDays: number[] = []
  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = new Date(YEAR, MONTH - 1, day).getDay() // 0 = Sunday
    if (weekday !== 0) workDays.push(day) // nghỉ Chủ nhật hàng tuần
  }

  console.log(`Tổng ${workDays.length} ngày công theo lịch trong tháng ${MONTH}/${YEAR}`)

  for (const day of workDays) {
    const workDate = dateOnly(day)
    const isLeave = day === LEAVE_DAY
    const isMissed = MISSED_DAYS.includes(day)

    await prisma.shiftAssignment.upsert({
      where: { userId_shiftId_workDate: { userId: user.id, shiftId: shift.id, workDate } },
      create: {
        userId: user.id,
        shiftId: shift.id,
        workDate,
        status: isLeave || isMissed ? 'ABSENT' : 'COMPLETED',
        note: isLeave ? 'Nghỉ phép' : null,
      },
      update: {
        status: isLeave || isMissed ? 'ABSENT' : 'COMPLETED',
        note: isLeave ? 'Nghỉ phép' : null,
      },
    })

    if (isLeave || isMissed) continue // không có attendance log cho 2 loại ngày này

    await prisma.attendanceLog.deleteMany({ where: { userId: user.id, workDate } })
    await prisma.attendanceLog.create({
      data: {
        userId: user.id,
        workDate,
        checkIn: atTime(day, 6, 0),
        checkOut: atTime(day, 14, 0),
        source: 'MANUAL',
        note: 'Seed dữ liệu demo',
      },
    })
  }

  // Đơn nghỉ phép đã được duyệt (khớp với ShiftAssignment.note ở trên)
  await prisma.leaveRequest.create({
    data: {
      userId: user.id,
      startDate: dateOnly(LEAVE_DAY),
      endDate: dateOnly(LEAVE_DAY),
      type: 'ANNUAL',
      reason: 'Việc gia đình',
      status: 'APPROVED',
      decidedAt: new Date(),
    },
  })

  // 2 yêu cầu bổ sung chấm công đang chờ duyệt
  for (const day of MISSED_DAYS) {
    await prisma.attendanceCorrectionRequest.create({
      data: {
        userId: user.id,
        workDate: dateOnly(day),
        checkIn: atTime(day, 6, 5),
        checkOut: atTime(day, 14, 5),
        reason: 'Quên bấm chấm công lúc vào ca',
        status: 'PENDING',
      },
    })
  }

  const fullAttendanceDays = workDays.length - 1 - MISSED_DAYS.length
  console.log(`Đã seed lịch làm việc tháng ${MONTH}/${YEAR} cho ${user.name} (${user.code})`)
  console.log(`- ${workDays.length} ngày công theo lịch (nghỉ Chủ nhật hàng tuần)`)
  console.log(`- ${fullAttendanceDays} ngày chấm công đầy đủ`)
  console.log(`- 1 ngày nghỉ phép đã duyệt: ${LEAVE_DAY}/${MONTH}`)
  console.log(`- 2 ngày quên chấm công (yêu cầu bổ sung đang PENDING): ${MISSED_DAYS.join(', ')}/${MONTH}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
