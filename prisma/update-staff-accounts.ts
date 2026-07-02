import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/common/password.util'

const prisma = new PrismaClient()

const NEW_PASSWORD = 'adminadmin'

const UPDATES = [
  { code: 'NV001', email: 'admin@thebrewcorner.com' },
  { code: 'NV002', email: 'cashier@thebrewcorner.com' },
  { code: 'NV003', email: 'waiter@thebrewcorner.com' },
  { code: 'NV004', email: 'barista@thebrewcorner.com' },
]

async function main() {
  const passwordHash = hashPassword(NEW_PASSWORD)

  for (const { code, email } of UPDATES) {
    const user = await prisma.user.update({
      where: { code },
      data: { email, passwordHash },
    })
    console.log(`${user.code} -> email=${user.email}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
