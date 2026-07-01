import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Unsplash CDN — free hotlinking, stable photo IDs from their most popular drinks
const us = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&h=400`

const CATEGORY_IMG: Record<string, string> = {
  'CAT-MILKTEA':   us('1558618666-fcd25c85cd64'), // brown bubble tea with pearls
  'CAT-FRUITTEA':  us('1495474472287-4d71bcdd2085'), // pink iced floral drink
  'CAT-SMOOTHIE':  us('1553530666-ba11a90a8bca'), // colorful smoothie
  'CAT-BLEND':     us('1553530666-ba11a90a8bca'), // blended drink
  'CAT-JUICE':     us('1519996529931-28324d5a630e'), // fresh juice glass
  'CAT-COFFEE':    us('1509042438-3ac93f8c5b65'), // cafe latte
  'CAT-ICEBLD':    us('1541167760496-1628856ab772'), // iced latte art
  'CAT-RAUMA':     us('1556679343-c7306c1976bc'), // matcha green drink
  'CAT-MILKCHOCO': us('1542990253-a781e44f6471'), // chocolate drink
}

const PRODUCT_IMG: Record<string, string> = {
  // ── TRÀ SỮA
  'TS-EM-L':       us('1558618666-fcd25c85cd64'), // classic boba
  'TS-EM-M':       us('1558618666-fcd25c85cd64'),
  'TS-KEM-TRUNG':  us('1559762718-b6ac9a06c946'), // cream top milk tea

  // ── TRÀ TRÁI CÂY
  'FT-MISS-DALAS':   us('1568622651-b5ea04524641'), // red/strawberry iced tea
  'FT-LYCHEE-BF':    us('1495474472287-4d71bcdd2085'), // butterfly pea blue-purple
  'FT-TAMARASS':     us('1544787219-7f47ccb76574'), // orange iced tea
  'FT-LYCHEE':       us('1578985545062-6a4ddfe0cc34'), // light pink lychee drink
  'FT-RED-FOREST':   us('1568622651-b5ea04524641'), // red iced tea
  'FT-GUAVA-PEACH':  us('1519996529931-28324d5a630e'), // peach / orange juice
  'FT-MASOURSOP':    us('1553530666-ba11a90a8bca'), // tropical mango
  'FT-PINE-SOURSOP': us('1519996529931-28324d5a630e'), // pineapple-style
  'FT-ALOHA-ATISO':  us('1495474472287-4d71bcdd2085'), // roselle / hibiscus

  // ── SINH TỐ
  'ST-BO':   us('1568633248455-cd63ca15b0a2'), // avocado green smoothie
  'ST-DAU':  us('1553530666-ba11a90a8bca'),   // strawberry smoothie pink
  'ST-XOAI': us('1553530666-ba11a90a8bca'),   // mango yellow smoothie

  // ── BLEND
  'BL-MANGOBERRY':     us('1553530666-ba11a90a8bca'),
  'BL-STRAW-DELIGHT':  us('1553530666-ba11a90a8bca'),
  'BL-FRESHLY-SUMMER': us('1519996529931-28324d5a630e'),
  'BL-CHOCO-PB':       us('1542990253-a781e44f6471'),

  // ── RÂU MÁ
  'RM-DAU-XANH-M': us('1556679343-c7306c1976bc'), // matcha/rau má green
  'RM-DAU-XANH-L': us('1556679343-c7306c1976bc'),
  'RM-XAY-M':      us('1568633248455-cd63ca15b0a2'), // blended green
  'RM-XAY-L':      us('1568633248455-cd63ca15b0a2'),

  // ── NƯỚC ÉP
  'JC-THOM':    us('1519996529931-28324d5a630e'), // pineapple/tropical
  'JC-CAM':     us('1544787219-7f47ccb76574'), // orange juice
  'JC-BUOI':    us('1519996529931-28324d5a630e'), // grapefruit
  'JC-TAO':     us('1570197788417-c66f737e0b5e'), // apple juice green
  'JC-DUA-HAU': us('1553530666-ba11a90a8bca'),   // watermelon pink
  'JC-THOM-DH': us('1519996529931-28324d5a630e'),

  // ── CÀ PHÊ
  'CF-SUA':           us('1509042438-3ac93f8c5b65'), // cafe latte
  'CF-DEN':           us('1461023058943-07fcbe16d735'), // black espresso
  'CF-CAPPUCCINO':    us('1522992319-3ef07a3ccbd3'), // cappuccino foam
  'CF-MOCHA':         us('1542990253-a781e44f6471'), // mocha chocolate
  'CF-COLDBREW-MEMO': us('1541167760496-1628856ab772'), // cold brew iced
  'CF-SUA-DUA':       us('1509042438-3ac93f8c5b65'), // coconut coffee

  // ── ĐÁ XAY
  'IB-ORIGINAL':     us('1541167760496-1628856ab772'), // iced blended
  'IB-CHANH':        us('1519996529931-28324d5a630e'), // lemon blended
  'IB-CHOCO':        us('1542990253-a781e44f6471'), // chocolate blended
  'IB-MATCHA':       us('1556679343-c7306c1976bc'), // matcha blended
  'IB-BLUE-YOGHURT': us('1495474472287-4d71bcdd2085'), // blue/purple yogurt
  'IB-COOKIES':      us('1542990253-a781e44f6471'), // cookies & cream

  // ── TRÀ SỮA & SÔ-CÔ-LA NÓNG
  'MC-TCA-DA':   us('1556679343-c7306c1976bc'), // matcha tea
  'MC-SCL-DA':   us('1542990253-a781e44f6471'), // chocolate
  'MC-TCA-NONG': us('1556679343-c7306c1976bc'), // hot matcha
  'MC-SCL-NONG': us('1522992319-3ef07a3ccbd3'), // hot chocolate
}

async function main() {
  console.log('Updating product images with Unsplash CDN URLs...')

  for (const [catCode, img] of Object.entries(CATEGORY_IMG)) {
    const cat = await prisma.category.findUnique({ where: { code: catCode } })
    if (!cat) { console.log(`  SKIP category ${catCode} not found`); continue }
    const { count } = await prisma.product.updateMany({
      where: { categoryId: cat.id },
      data: { imageUrl: img },
    })
    console.log(`  ${catCode}: ${count} products set to category default`)
  }

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
