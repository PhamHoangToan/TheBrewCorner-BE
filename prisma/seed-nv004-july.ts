import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const USER_CODE = 'NV004'
const SHIFT_CODE = 'CA1' // Ca 1 (6h-14h)
const YEAR = 2026
const MONTH = 7 // July

const dateOnly = (day: number) => new Date(Date.UTC(YEAR, MONTH - 1, day))

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { code: USER_CODE } })
  const shift = await prisma.shift.findUniqueOrThrow({ where: { code: SHIFT_CODE } })

  const daysInMonth = new Date(YEAR, MONTH, 0).getDate()
  const workDays: number[] = []
  for (let day = 1; day <= daysInMonth; day++) {
    const weekday = new Date(YEAR, MONTH - 1, day).getDay() // 0 = Sunday
    if (weekday !== 0) workDays.push(day) // nghỉ Chủ nhật hàng tuần
  }

  for (const day of workDays) {
    const workDate = dateOnly(day)
    await prisma.shiftAssignment.upsert({
      where: { userId_shiftId_workDate: { userId: user.id, shiftId: shift.id, workDate } },
      create: { userId: user.id, shiftId: shift.id, workDate, status: 'SCHEDULED' },
      update: { status: 'SCHEDULED', note: null },
    })
  }

  console.log(`Đã tạo ${workDays.length} ca làm việc (chỉ lịch, chưa có chấm công) cho ${user.name} (${user.code}) tháng ${MONTH}/${YEAR}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
