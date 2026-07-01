/**
 * One-time migration: upload every file already sitting in ./uploads (from back
 * when the BE ran locally with disk storage) to Cloudinary, then rewrite the
 * `http://localhost:3000/uploads/xxx.jpg` URLs stored in Product.imageUrl and
 * User.avatarUrl to the new Cloudinary secure_url.
 *
 * Run once: npx ts-node scripts/migrate-images-to-cloudinary.ts
 */
import { PrismaClient } from '@prisma/client'
import { v2 as cloudinary } from 'cloudinary'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import 'dotenv/config'

const prisma = new PrismaClient()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const UPLOADS_DIR = join(process.cwd(), 'uploads')

// Cache so identical /uploads/xxx.jpg references (e.g. reused across rows) only upload once.
const cache = new Map<string, string>()

async function migrateUrl(oldUrl: string | null): Promise<string | null> {
  if (!oldUrl) return oldUrl
  const match = oldUrl.match(/\/uploads\/([^/?#]+)$/)
  if (!match) return oldUrl // not a local-upload URL — leave untouched (e.g. already an external CDN link)

  const filename = match[1]
  if (cache.has(filename)) return cache.get(filename)!

  const filePath = join(UPLOADS_DIR, filename)
  if (!existsSync(filePath)) {
    console.warn(`  ! File không tồn tại trên đĩa, bỏ qua: ${filename}`)
    return oldUrl
  }

  const buffer = readFileSync(filePath)
  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: 'the-brew-corner' }, (error, res) => {
      if (error || !res) return reject(error ?? new Error('upload failed'))
      resolve(res)
    })
    stream.end(buffer)
  })

  cache.set(filename, result.secure_url)
  console.log(`  ✓ ${filename} -> ${result.secure_url}`)
  return result.secure_url
}

async function main() {
  console.log('Migrating Product.imageUrl...')
  const products = await prisma.product.findMany({ where: { imageUrl: { not: null } } })
  for (const p of products) {
    const newUrl = await migrateUrl(p.imageUrl)
    if (newUrl !== p.imageUrl) {
      await prisma.product.update({ where: { id: p.id }, data: { imageUrl: newUrl } })
    }
  }

  console.log('Migrating User.avatarUrl...')
  const users = await prisma.user.findMany({ where: { avatarUrl: { not: null } } })
  for (const u of users) {
    const newUrl = await migrateUrl(u.avatarUrl)
    if (newUrl !== u.avatarUrl) {
      await prisma.user.update({ where: { id: u.id }, data: { avatarUrl: newUrl } })
    }
  }

  console.log(`Done. ${cache.size} file(s) uploaded to Cloudinary.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
