import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Pexels CDN — stable, hotlink-friendly
const px = (id: number, w = 400, h = 400) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}&h=${h}&dpr=1`

// Category-level representative images (verified popular Pexels IDs)
const CAT_IMG: Record<string, string> = {
  'CAT-MILKTEA':   px(7488668),   // bubble tea
  'CAT-FRUITTEA':  px(1337387),   // iced fruit tea
  'CAT-SMOOTHIE':  px(3625372),   // smoothie
  'CAT-BLEND':     px(775032),    // blended drink
  'CAT-JUICE':     px(96974),     // fresh juice
  'CAT-COFFEE':    px(302899),    // coffee
  'CAT-ICEBLD':    px(2615323),   // iced blended coffee
  'CAT-RAUMA':     px(1640774),   // green drink
  'CAT-MILKCHOCO': px(312418),    // chocolate milk
}

// Per-product overrides — use different Pexels IDs for variety within category
const PRODUCT_IMG: Record<string, string> = {
  // ── TRÀ SỮA
  'TS-EM-L':        px(7488668),
  'TS-EM-M':        px(5946070),   // milk tea glass
  'TS-KEM-TRUNG':   px(8871830),   // cream top tea

  // ── TRÀ TRÁI CÂY
  'FT-MISS-DALAS':   px(1337387),
  'FT-LYCHEE-BF':    px(5946041),  // purple iced tea
  'FT-TAMARASS':     px(2109906),  // orange iced tea
  'FT-LYCHEE':       px(1536525),  // lychee drink
  'FT-RED-FOREST':   px(2679454),  // red iced tea
  'FT-GUAVA-PEACH':  px(1508663),  // peach iced tea
  'FT-MASOURSOP':    px(3407777),  // mango tea
  'FT-PINE-SOURSOP': px(1377034),  // tropical tea
  'FT-ALOHA-ATISO':  px(1382575),  // rose iced tea

  // ── SINH TỐ
  'ST-BO':   px(1640774),   // avocado green smoothie
  'ST-DAU':  px(3625372),   // strawberry smoothie
  'ST-XOAI': px(1162456),   // mango smoothie

  // ── BLEND
  'BL-MANGOBERRY':     px(775032),
  'BL-STRAW-DELIGHT':  px(1132047),
  'BL-FRESHLY-SUMMER': px(1435894),
  'BL-CHOCO-PB':       px(3026803),

  // ── RÂU MÁ
  'RM-DAU-XANH-M': px(1640774),
  'RM-DAU-XANH-L': px(1640774),
  'RM-XAY-M':      px(1640774),
  'RM-XAY-L':      px(1640774),

  // ── NƯỚC ÉP
  'JC-THOM':    px(159293),    // pineapple juice
  'JC-CAM':     px(96974),     // orange juice
  'JC-BUOI':    px(2109905),   // grapefruit juice
  'JC-TAO':     px(1346347),   // apple juice
  'JC-DUA-HAU': px(2109099),   // watermelon juice
  'JC-THOM-DH': px(1435735),   // tropical mix

  // ── CÀ PHÊ
  'CF-SUA':           px(302899),
  'CF-DEN':           px(894695),
  'CF-CAPPUCCINO':    px(312418),
  'CF-MOCHA':         px(2638026),
  'CF-COLDBREW-MEMO': px(2249959),
  'CF-SUA-DUA':       px(1695052),

  // ── ĐÁ XAY
  'IB-ORIGINAL':    px(2615323),
  'IB-CHANH':       px(1435894),
  'IB-CHOCO':       px(3026803),
  'IB-MATCHA':      px(2524580),
  'IB-BLUE-YOGHURT': px(4551832),
  'IB-COOKIES':     px(3026803),

  // ── TRÀ SỮA & SÔ-CÔ-LA
  'MC-TCA-DA':   px(2524580),
  'MC-SCL-DA':   px(3026803),
  'MC-TCA-NONG': px(2524580),
  'MC-SCL-NONG': px(312418),
}

async function main() {
  // Step 1: assign category-level images first
  for (const [catCode, img] of Object.entries(CAT_IMG)) {
    const cat = await prisma.category.findUnique({ where: { code: catCode } })
    if (!cat) continue
    const { count } = await prisma.product.updateMany({
      where: { categoryId: cat.id },
      data: { imageUrl: img },
    })
    console.log(`  ${catCode}: ${count} products → category default image`)
  }

  // Step 2: override per-product
  let overridden = 0
  for (const [code, img] of Object.entries(PRODUCT_IMG)) {
    const { count } = await prisma.product.updateMany({ where: { code }, data: { imageUrl: img } })
    if (count > 0) overridden++
  }
  console.log(`  Per-product overrides: ${overridden}`)
  console.log('Done.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
