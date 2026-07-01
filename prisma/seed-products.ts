import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()
const money = (v: number) => new Prisma.Decimal(v)
const qty = (v: number) => new Prisma.Decimal(v)

// ─── CATEGORIES ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { code: 'CAT-MILKTEA',   name: 'Trà Sữa' },
  { code: 'CAT-FRUITTEA',  name: 'Trà Trái Cây' },
  { code: 'CAT-SMOOTHIE',  name: 'Sinh Tố' },
  { code: 'CAT-BLEND',     name: 'Blend' },
  { code: 'CAT-JUICE',     name: 'Nước Ép' },
  { code: 'CAT-COFFEE',    name: 'Cà Phê' },
  { code: 'CAT-ICEBLD',    name: 'Đá Xay' },
  { code: 'CAT-RAUMA',     name: 'Rau Má' },
  { code: 'CAT-MILKCHOCO', name: 'Trà Sữa & Sô-cô-la' },
]

// ─── INGREDIENT CODE MAP (recipe name → DB code) ─────────────────────────────
// Dùng để tra ingredientId khi tạo ProductRecipe
const ING: Record<string, string> = {
  'tra-sua-nen':       'NLE-X012',
  'nuoc-duong':        'NLE-X007',
  'duong-nuoc-mango':  'NLE-X010',
  'tran-chau-den':     'NLE-X011',
  'tran-chau-trang':   'NLE-00002',
  'tran-chau-caramen': 'NLE-00595',
  'pudding':           'NLE-00114',
  'bot-frappe':        'NLE-00084',
  'frappe-powder':     'NLE-00084B',
  'bot-nesquik':       'NLE-00221',
  'bot-soco':          'NLE-00221B',
  'bot-tca':           'NLE-00126',
  'bot-beo-bone':      'NLE-00076',
  'bot-kem-trung':     'NLE-00090',
  'muoi-vanilla':      'NLE-00128',
  'ca-phe':            'NLE-00165',
  'coldbrew':          'NLE-00227',
  'sua-tuoi':          'NLE-00924',
  'sua-dac':           'NLE-00919',
  'sua-chua':          'NLE-00916',
  'yoghurt':           'NLE-00916B',
  'kem-dua':           'H0050025',
  'nuoc-cot-dua':      'NLE-00615',
  'bot-dua':           'NLE-00297',
  'vun-dua':           'NLE-00297B',
  'whipping-cream':    'NLE-00411',
  'duong-cat':         'NLE-00316',
  'nuoc-loc':          'NLE-X015',
  'da-vien':           'NLE-X016',
  'rock-salt':         'NLE-00543',
  'black-sugar':       'NLE-00884',
  'caramel-syrup':     'NLE-00950',
  'elderflower-syrup': 'NLE-00951',
  'syrup-atiso':       'NLE-00550',
  'syrup-dua':         'NLE-00948',
  'syrup-mo':          'NLE-00941',
  'syrup-vai':         'NLE-00959',
  'syrup-dao':         'NLE-00961',
  'syrup-sca':         'NLE-X009',
  'syrup-kem':         'NLE-X018',
  'sot-dau':           'NLE-01024',
  'sot-vai':           'NLE-01028B',
  'sot-trai-vai':      'NLE-01028',
  'sot-me':            'NLE-01026',
  'sot-trai-me':       'NLE-01026B',
  'sot-ly-chua-den':   'NLE-00620',
  'sot-oi-hong':       'NLE-00681',
  'sot-viet-quat':     'NLE-X019',
  'sot-choco':         'NLE-00945',
  'mix-berries':       'NLE-01025',
  'mango-base':        'NLE-X001',
  'straw-base':        'NLE-X002',
  'bo-dau-phong':      'NLE-00057',
  'mut-xoai':          'NLE-X006',
  'mut-mang-cau':      'NLE-X004',
  'mut-thom':          'NLE-X005',
  'kem-vi':            'NLE-X003',
  'kombucha':          'NLE-X017',
  'oreo':              'NLE-X020',
  'hat-chia':          'NLE-00219',
  'nha-dam':           'NLE-00601',
  'hoa-dau-biec':      'NLE-00137',
  'hoa-dau-biec-b':    'NLE-00137B',
  'tra-lai':           'NLE-01019',
  'tra-den':           'NLE-01015',
  'tra-oolong':        'NLE-01021',
  'tra-dao':           'NLE-01014',
  'hong-tra':          'NLE-00398',
  'syrup-atisodo':     'NLE-00550',
  'nuoc-chanh':        'NLE-00461',
  'nuoc-tac':          'NLE-00962',
  'sca':               'NLE-00875',
  'bươi':              'NLE-00135',
  'cam':               'NLE-00641',
  'chuoi':             'NLE-00222',
  'dau-tay':           'NLE-00281',
  'thanh-long':        'NLE-00978',
  'trai-bo':           'NLE-00062',
  'xoai':              'NLE-01076',
  'ep-buoi':           'NLE-00135J',
  'ep-cam':            'NLE-00641J',
  'ep-dua-hau':        'NLE-00293J',
  'ep-thom':           'NLE-00680',
  'ep-tao':            'NLE-00964J',
  'rau-ma':            'NLE-00653B',
  'la-rau-ma':         'NLE-00653',
  'dau-xanh':          'NLE-00286',
  'cherry':            'NLE-00719',
  'la-mint':           'NLE-00703',
  'la-tia-to':         'NLE-X014',
  'la-basil':          'NLE-00046',
  'cam-kho':           'NLE-00189',
  'dua-hau-lat':       'NLE-00293',
  'tao-lat':           'NLE-00964',
}

type RecipeItem = { ing: string; qty: number; unit: string }

// ─── PRODUCT DEFINITIONS ──────────────────────────────────────────────────────
const PRODUCTS: {
  code: string
  name: string
  cat: string
  price: number
  imageUrl: string
  recipe: RecipeItem[]
}[] = [
  // ── TRÀ SỮA ─────────────────────────────────────────────────────────────
  {
    code: 'TS-EM-L', name: 'Trà Sữa "EM" - Size L', cat: 'CAT-MILKTEA', price: 75000,
    imageUrl: 'https://picsum.photos/seed/TS-EM-L/400/400',
    recipe: [
      { ing: 'tra-sua-nen', qty: 250, unit: 'ml' },
      { ing: 'nuoc-duong', qty: 10, unit: 'ml' },
      { ing: 'tran-chau-den', qty: 0.17, unit: 'vá' },
      { ing: 'tran-chau-trang', qty: 1, unit: 'vá' },
      { ing: 'tran-chau-caramen', qty: 1, unit: 'vá' },
      { ing: 'pudding', qty: 2, unit: 'viên' },
    ],
  },
  {
    code: 'TS-EM-M', name: 'Trà Sữa "EM" - Size M', cat: 'CAT-MILKTEA', price: 69000,
    imageUrl: 'https://picsum.photos/seed/TS-EM-M/400/400',
    recipe: [
      { ing: 'tra-sua-nen', qty: 180, unit: 'ml' },
      { ing: 'nuoc-duong', qty: 10, unit: 'ml' },
      { ing: 'tran-chau-den', qty: 0.17, unit: 'vá' },
      { ing: 'tran-chau-trang', qty: 0.5, unit: 'vá' },
      { ing: 'tran-chau-caramen', qty: 0.5, unit: 'vá' },
      { ing: 'pudding', qty: 2, unit: 'viên' },
    ],
  },
  {
    code: 'TS-KEM-TRUNG', name: 'Trà Sữa Kem Trứng', cat: 'CAT-MILKTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/TS-KEM-TRUNG/400/400',
    recipe: [
      { ing: 'ca-phe', qty: 100, unit: 'ml' },
      { ing: 'tra-sua-nen', qty: 50, unit: 'ml' },
      { ing: 'bot-kem-trung', qty: 60, unit: 'g' },
      { ing: 'bot-beo-bone', qty: 60, unit: 'g' },
      { ing: 'sua-tuoi', qty: 200, unit: 'ml' },
      { ing: 'bot-frappe', qty: 20, unit: 'g' },
    ],
  },

  // ── TRÀ TRÁI CÂY ────────────────────────────────────────────────────────
  {
    code: 'FT-MISS-DALAS', name: 'Trà Dâu - "Miss Dalas"', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-MISS-DALAS/400/400',
    recipe: [
      { ing: 'tra-lai', qty: 180, unit: 'ml' },
      { ing: 'mix-berries', qty: 30, unit: 'ml' },
      { ing: 'hat-chia', qty: 1, unit: 'g' },
    ],
  },
  {
    code: 'FT-LYCHEE-BF', name: 'Trà Vải Hoa Đậu Biếc - Lychee Butterfly', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-LYCHEE-BF/400/400',
    recipe: [
      { ing: 'tra-den', qty: 180, unit: 'ml' },
      { ing: 'hoa-dau-biec-b', qty: 2, unit: 'g' },
      { ing: 'syrup-vai', qty: 25, unit: 'ml' },
      { ing: 'sot-trai-vai', qty: 30, unit: 'ml' },
      { ing: 'nuoc-chanh', qty: 5, unit: 'ml' },
      { ing: 'sca', qty: 5, unit: 'g' },
      { ing: 'la-mint', qty: 2, unit: 'lá' },
    ],
  },
  {
    code: 'FT-TAMARASS', name: 'Trà Me Thái - "EM" Tamarass', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-TAMARASS/400/400',
    recipe: [
      { ing: 'tra-oolong', qty: 180, unit: 'ml' },
      { ing: 'sot-trai-me', qty: 30, unit: 'ml' },
      { ing: 'syrup-dao', qty: 25, unit: 'ml' },
      { ing: 'syrup-sca', qty: 25, unit: 'ml' },
      { ing: 'nuoc-chanh', qty: 5, unit: 'ml' },
    ],
  },
  {
    code: 'FT-LYCHEE', name: 'Trà Vải - Lychee', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-LYCHEE/400/400',
    recipe: [
      { ing: 'tra-den', qty: 180, unit: 'ml' },
      { ing: 'sot-vai', qty: 30, unit: 'ml' },
      { ing: 'syrup-vai', qty: 25, unit: 'ml' },
      { ing: 'nuoc-chanh', qty: 5, unit: 'ml' },
      { ing: 'sca', qty: 5, unit: 'g' },
      { ing: 'la-mint', qty: 2, unit: 'lá' },
    ],
  },
  {
    code: 'FT-RED-FOREST', name: 'Trà Thanh Long - Red Forest', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-RED-FOREST/400/400',
    recipe: [
      { ing: 'hong-tra', qty: 180, unit: 'ml' },
      { ing: 'sot-ly-chua-den', qty: 30, unit: 'ml' },
      { ing: 'syrup-vai', qty: 25, unit: 'ml' },
      { ing: 'thanh-long', qty: 30, unit: 'g' },
      { ing: 'tran-chau-trang', qty: 0.5, unit: 'vá' },
    ],
  },
  {
    code: 'FT-GUAVA-PEACH', name: 'Trà Đào Ổi Hồng - Guava Peach', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-GUAVA-PEACH/400/400',
    recipe: [
      { ing: 'tra-dao', qty: 180, unit: 'ml' },
      { ing: 'sot-oi-hong', qty: 30, unit: 'ml' },
      { ing: 'syrup-dao', qty: 25, unit: 'ml' },
      { ing: 'nuoc-chanh', qty: 5, unit: 'ml' },
      { ing: 'hat-chia', qty: 1, unit: 'g' },
    ],
  },
  {
    code: 'FT-MASOURSOP', name: 'Trà Xoài - Mãng Cầu - Masoursop Butterfly', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-MASOURSOP/400/400',
    recipe: [
      { ing: 'tra-lai', qty: 180, unit: 'ml' },
      { ing: 'mut-xoai', qty: 25, unit: 'ml' },
      { ing: 'mut-mang-cau', qty: 25, unit: 'ml' },
      { ing: 'nuoc-chanh', qty: 5, unit: 'ml' },
      { ing: 'hoa-dau-biec-b', qty: 2, unit: 'g' },
      { ing: 'tran-chau-trang', qty: 0.5, unit: 'vá' },
    ],
  },
  {
    code: 'FT-PINE-SOURSOP', name: 'Trà Thơm - Mãng Cầu Kombucha', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-PINE-SOURSOP/400/400',
    recipe: [
      { ing: 'tra-lai', qty: 180, unit: 'ml' },
      { ing: 'mut-thom', qty: 25, unit: 'ml' },
      { ing: 'mut-mang-cau', qty: 25, unit: 'ml' },
      { ing: 'tran-chau-trang', qty: 0.5, unit: 'vá' },
      { ing: 'kombucha', qty: 50, unit: 'ml' },
    ],
  },
  {
    code: 'FT-ALOHA-ATISO', name: 'Trà Atiso Đỏ Nha Đam - Aloha Atiso', cat: 'CAT-FRUITTEA', price: 79000,
    imageUrl: 'https://picsum.photos/seed/FT-ALOHA-ATISO/400/400',
    recipe: [
      { ing: 'tra-den', qty: 180, unit: 'ml' },
      { ing: 'syrup-atiso', qty: 25, unit: 'ml' },
      { ing: 'nuoc-tac', qty: 5, unit: 'ml' },
      { ing: 'nuoc-duong', qty: 10, unit: 'ml' },
      { ing: 'nha-dam', qty: 20, unit: 'g' },
    ],
  },

  // ── SINH TỐ ──────────────────────────────────────────────────────────────
  {
    code: 'ST-BO', name: 'Sinh Tố Bơ - Avocado Smoothie', cat: 'CAT-SMOOTHIE', price: 79000,
    imageUrl: 'https://picsum.photos/seed/ST-BO/400/400',
    recipe: [
      { ing: 'trai-bo', qty: 1, unit: 'trái' },
      { ing: 'sua-dac', qty: 60, unit: 'ml' },
      { ing: 'duong-cat', qty: 10, unit: 'g' },
      { ing: 'sua-tuoi', qty: 120, unit: 'ml' },
      { ing: 'cherry', qty: 1, unit: 'trái' },
      { ing: 'la-mint', qty: 1, unit: 'lá' },
    ],
  },
  {
    code: 'ST-DAU', name: 'Sinh Tố Dâu - Strawberry Smoothie', cat: 'CAT-SMOOTHIE', price: 79000,
    imageUrl: 'https://picsum.photos/seed/ST-DAU/400/400',
    recipe: [
      { ing: 'dau-tay', qty: 5, unit: 'trái' },
      { ing: 'sua-dac', qty: 80, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 120, unit: 'ml' },
      { ing: 'duong-cat', qty: 10, unit: 'g' },
    ],
  },
  {
    code: 'ST-XOAI', name: 'Sinh Tố Xoài - Mango Smoothie', cat: 'CAT-SMOOTHIE', price: 79000,
    imageUrl: 'https://picsum.photos/seed/ST-XOAI/400/400',
    recipe: [
      { ing: 'xoai', qty: 0.5, unit: 'kg' },
      { ing: 'sua-dac', qty: 90, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 120, unit: 'ml' },
      { ing: 'duong-cat', qty: 10, unit: 'g' },
    ],
  },

  // ── BLEND ────────────────────────────────────────────────────────────────
  {
    code: 'BL-MANGOBERRY', name: 'Mango Berry', cat: 'CAT-BLEND', price: 85000,
    imageUrl: 'https://picsum.photos/seed/BL-MANGOBERRY/400/400',
    recipe: [
      { ing: 'xoai', qty: 0.67, unit: 'kg' },
      { ing: 'duong-nuoc-mango', qty: 30, unit: 'ml' },
      { ing: 'da-vien', qty: 4, unit: 'viên' },
      { ing: 'dau-tay', qty: 5, unit: 'trái' },
      { ing: 'nuoc-loc', qty: 20, unit: 'ml' },
      { ing: 'sot-dau', qty: 30, unit: 'ml' },
      { ing: 'la-tia-to', qty: 2, unit: 'lá' },
      { ing: 'la-mint', qty: 2, unit: 'lá' },
    ],
  },
  {
    code: 'BL-STRAW-DELIGHT', name: 'Strawberry Delight', cat: 'CAT-BLEND', price: 85000,
    imageUrl: 'https://picsum.photos/seed/BL-STRAW-DELIGHT/400/400',
    recipe: [
      { ing: 'dau-tay', qty: 4, unit: 'trái' },
      { ing: 'xoai', qty: 0.33, unit: 'kg' },
      { ing: 'cam', qty: 30, unit: 'ml' },
      { ing: 'la-basil', qty: 3, unit: 'lá' },
      { ing: 'mango-base', qty: 10, unit: 'ml' },
      { ing: 'straw-base', qty: 10, unit: 'ml' },
      { ing: 'elderflower-syrup', qty: 15, unit: 'ml' },
    ],
  },
  {
    code: 'BL-FRESHLY-SUMMER', name: 'Freshly Summer', cat: 'CAT-BLEND', price: 85000,
    imageUrl: 'https://picsum.photos/seed/BL-FRESHLY-SUMMER/400/400',
    recipe: [
      { ing: 'bươi', qty: 3, unit: 'múi' },
      { ing: 'cam', qty: 0.25, unit: 'kg' },
      { ing: 'yoghurt', qty: 0.5, unit: 'hủ' },
      { ing: 'syrup-kem', qty: 15, unit: 'ml' },
      { ing: 'cherry', qty: 1, unit: 'trái' },
    ],
  },
  {
    code: 'BL-CHOCO-PB', name: 'Chocolate Peanut Butter', cat: 'CAT-BLEND', price: 85000,
    imageUrl: 'https://picsum.photos/seed/BL-CHOCO-PB/400/400',
    recipe: [
      { ing: 'chuoi', qty: 3, unit: 'trái' },
      { ing: 'bot-nesquik', qty: 2, unit: 'muỗng' },
      { ing: 'sua-tuoi', qty: 90, unit: 'ml' },
      { ing: 'bo-dau-phong', qty: 1, unit: 'muỗng' },
    ],
  },

  // ── RÂU MÁ ──────────────────────────────────────────────────────────────
  {
    code: 'RM-DAU-XANH-M', name: 'Rau Má Đậu Xanh - Size M', cat: 'CAT-RAUMA', price: 49000,
    imageUrl: 'https://picsum.photos/seed/RM-DAU-XANH-M/400/400',
    recipe: [
      { ing: 'rau-ma', qty: 180, unit: 'ml' },
      { ing: 'dau-xanh', qty: 3, unit: 'muỗng' },
      { ing: 'la-rau-ma', qty: 2, unit: 'lá' },
    ],
  },
  {
    code: 'RM-DAU-XANH-L', name: 'Rau Má Đậu Xanh - Size L', cat: 'CAT-RAUMA', price: 55000,
    imageUrl: 'https://picsum.photos/seed/RM-DAU-XANH-L/400/400',
    recipe: [
      { ing: 'rau-ma', qty: 250, unit: 'ml' },
      { ing: 'dau-xanh', qty: 4, unit: 'muỗng' },
      { ing: 'la-rau-ma', qty: 2, unit: 'lá' },
    ],
  },
  {
    code: 'RM-XAY-M', name: 'Rau Má Xay - Size M', cat: 'CAT-RAUMA', price: 45000,
    imageUrl: 'https://picsum.photos/seed/RM-XAY-M/400/400',
    recipe: [
      { ing: 'rau-ma', qty: 180, unit: 'ml' },
      { ing: 'la-rau-ma', qty: 2, unit: 'lá' },
    ],
  },
  {
    code: 'RM-XAY-L', name: 'Rau Má Xay - Size L', cat: 'CAT-RAUMA', price: 49000,
    imageUrl: 'https://picsum.photos/seed/RM-XAY-L/400/400',
    recipe: [
      { ing: 'rau-ma', qty: 250, unit: 'ml' },
      { ing: 'la-rau-ma', qty: 2, unit: 'lá' },
    ],
  },

  // ── NƯỚC ÉP ─────────────────────────────────────────────────────────────
  {
    code: 'JC-THOM', name: 'Nước Ép Thơm - Pineapple Juice', cat: 'CAT-JUICE', price: 59000,
    imageUrl: 'https://picsum.photos/seed/JC-THOM/400/400',
    recipe: [
      { ing: 'ep-thom', qty: 180, unit: 'ml' },
      { ing: 'cherry', qty: 1, unit: 'trái' },
      { ing: 'la-mint', qty: 1, unit: 'lá' },
    ],
  },
  {
    code: 'JC-CAM', name: 'Nước Ép Cam - Orange Juice', cat: 'CAT-JUICE', price: 59000,
    imageUrl: 'https://picsum.photos/seed/JC-CAM/400/400',
    recipe: [
      { ing: 'ep-cam', qty: 180, unit: 'ml' },
      { ing: 'cherry', qty: 1, unit: 'trái' },
      { ing: 'la-mint', qty: 1, unit: 'lá' },
    ],
  },
  {
    code: 'JC-BUOI', name: 'Nước Ép Bưởi - Pomelo Juice', cat: 'CAT-JUICE', price: 59000,
    imageUrl: 'https://picsum.photos/seed/JC-BUOI/400/400',
    recipe: [
      { ing: 'ep-buoi', qty: 180, unit: 'ml' },
      { ing: 'cherry', qty: 1, unit: 'trái' },
      { ing: 'la-mint', qty: 1, unit: 'lá' },
    ],
  },
  {
    code: 'JC-TAO', name: 'Nước Ép Táo - Apple Juice', cat: 'CAT-JUICE', price: 59000,
    imageUrl: 'https://picsum.photos/seed/JC-TAO/400/400',
    recipe: [
      { ing: 'ep-tao', qty: 180, unit: 'ml' },
      { ing: 'tao-lat', qty: 3, unit: 'lát' },
    ],
  },
  {
    code: 'JC-DUA-HAU', name: 'Nước Ép Dưa Hấu - Watermelon Juice', cat: 'CAT-JUICE', price: 59000,
    imageUrl: 'https://picsum.photos/seed/JC-DUA-HAU/400/400',
    recipe: [
      { ing: 'ep-dua-hau', qty: 180, unit: 'ml' },
      { ing: 'dua-hau-lat', qty: 2, unit: 'lát' },
    ],
  },
  {
    code: 'JC-THOM-DH', name: 'Nước Ép Thơm & Dưa Hấu', cat: 'CAT-JUICE', price: 65000,
    imageUrl: 'https://picsum.photos/seed/JC-THOM-DH/400/400',
    recipe: [
      { ing: 'ep-thom', qty: 90, unit: 'ml' },
      { ing: 'ep-dua-hau', qty: 90, unit: 'ml' },
      { ing: 'dua-hau-lat', qty: 2, unit: 'lát' },
    ],
  },

  // ── CÀ PHÊ ──────────────────────────────────────────────────────────────
  {
    code: 'CF-COLDBREW-MEMO', name: 'Cà Phê Ủ Lạnh Me Mơ - Tamaricot Coldbrew', cat: 'CAT-COFFEE', price: 69000,
    imageUrl: 'https://picsum.photos/seed/CF-COLDBREW-MEMO/400/400',
    recipe: [
      { ing: 'coldbrew', qty: 80, unit: 'ml' },
      { ing: 'syrup-mo', qty: 20, unit: 'ml' },
      { ing: 'sot-me', qty: 30, unit: 'ml' },
      { ing: 'sca', qty: 5, unit: 'g' },
      { ing: 'cam-kho', qty: 1, unit: 'lát' },
    ],
  },
  {
    code: 'CF-SUA', name: 'Cà Phê Sữa', cat: 'CAT-COFFEE', price: 35000,
    imageUrl: 'https://picsum.photos/seed/CF-SUA/400/400',
    recipe: [
      { ing: 'ca-phe', qty: 60, unit: 'ml' },
      { ing: 'sua-dac', qty: 30, unit: 'ml' },
    ],
  },
  {
    code: 'CF-DEN', name: 'Cà Phê Đen', cat: 'CAT-COFFEE', price: 29000,
    imageUrl: 'https://picsum.photos/seed/CF-DEN/400/400',
    recipe: [
      { ing: 'ca-phe', qty: 60, unit: 'ml' },
      { ing: 'nuoc-duong', qty: 30, unit: 'ml' },
    ],
  },
  {
    code: 'CF-CAPPUCCINO', name: 'Cappuccino', cat: 'CAT-COFFEE', price: 59000,
    imageUrl: 'https://picsum.photos/seed/CF-CAPPUCCINO/400/400',
    recipe: [
      { ing: 'ca-phe', qty: 40, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 200, unit: 'ml' },
    ],
  },
  {
    code: 'CF-MOCHA', name: 'Mocha Coffee', cat: 'CAT-COFFEE', price: 65000,
    imageUrl: 'https://picsum.photos/seed/CF-MOCHA/400/400',
    recipe: [
      { ing: 'ca-phe', qty: 40, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 200, unit: 'ml' },
      { ing: 'bot-soco', qty: 2, unit: 'muỗng' },
      { ing: 'sot-choco', qty: 10, unit: 'ml' },
    ],
  },
  {
    code: 'CF-SUA-DUA', name: 'Cà Phê Sữa Dừa', cat: 'CAT-COFFEE', price: 69000,
    imageUrl: 'https://picsum.photos/seed/CF-SUA-DUA/400/400',
    recipe: [
      { ing: 'ca-phe', qty: 60, unit: 'ml' },
      { ing: 'kem-dua', qty: 2, unit: 'muỗng' },
      { ing: 'nuoc-cot-dua', qty: 90, unit: 'ml' },
      { ing: 'bot-dua', qty: 2, unit: 'muỗng' },
      { ing: 'sua-dac', qty: 20, unit: 'ml' },
      { ing: 'syrup-dua', qty: 5, unit: 'ml' },
      { ing: 'vun-dua', qty: 5, unit: 'g' },
    ],
  },

  // ── ĐÁ XAY ──────────────────────────────────────────────────────────────
  {
    code: 'IB-ORIGINAL', name: 'Cà Phê Đá Xay - Original Ice Blend', cat: 'CAT-ICEBLD', price: 79000,
    imageUrl: 'https://picsum.photos/seed/IB-ORIGINAL/400/400',
    recipe: [
      { ing: 'ca-phe', qty: 90, unit: 'ml' },
      { ing: 'sua-dac', qty: 45, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 15, unit: 'ml' },
      { ing: 'caramel-syrup', qty: 10, unit: 'ml' },
      { ing: 'frappe-powder', qty: 1, unit: 'muỗng' },
      { ing: 'whipping-cream', qty: 30, unit: 'g' },
      { ing: 'rock-salt', qty: 1, unit: 'g' },
      { ing: 'black-sugar', qty: 5, unit: 'ml' },
    ],
  },
  {
    code: 'IB-CHANH', name: 'Chanh Đá Xay - Lime Ice Blended', cat: 'CAT-ICEBLD', price: 59000,
    imageUrl: 'https://picsum.photos/seed/IB-CHANH/400/400',
    recipe: [
      { ing: 'nuoc-chanh', qty: 60, unit: 'ml' },
      { ing: 'nuoc-duong', qty: 100, unit: 'ml' },
      { ing: 'da-vien', qty: 6, unit: 'viên' },
    ],
  },
  {
    code: 'IB-CHOCO', name: 'Sô Cô La Đá Xay - Chocolate Ice Blended', cat: 'CAT-ICEBLD', price: 69000,
    imageUrl: 'https://picsum.photos/seed/IB-CHOCO/400/400',
    recipe: [
      { ing: 'bot-soco', qty: 3, unit: 'muỗng' },
      { ing: 'sua-dac', qty: 60, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 60, unit: 'ml' },
    ],
  },
  {
    code: 'IB-MATCHA', name: 'Trà Xanh Đá Xay - Matcha Ice Blended', cat: 'CAT-ICEBLD', price: 69000,
    imageUrl: 'https://picsum.photos/seed/IB-MATCHA/400/400',
    recipe: [
      { ing: 'bot-tca', qty: 3, unit: 'muỗng' },
      { ing: 'sua-dac', qty: 70, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 60, unit: 'ml' },
    ],
  },
  {
    code: 'IB-BLUE-YOGHURT', name: 'Yaua Việt Quất Đá Xay - Blueberry Yoghurt Ice Blended', cat: 'CAT-ICEBLD', price: 79000,
    imageUrl: 'https://picsum.photos/seed/IB-BLUE-YOGHURT/400/400',
    recipe: [
      { ing: 'sua-chua', qty: 1, unit: 'hũ' },
      { ing: 'sot-viet-quat', qty: 60, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 90, unit: 'ml' },
      { ing: 'sua-dac', qty: 20, unit: 'ml' },
    ],
  },
  {
    code: 'IB-COOKIES', name: 'Cookies Đá Xay - Dark Cookies Ice Blended', cat: 'CAT-ICEBLD', price: 79000,
    imageUrl: 'https://picsum.photos/seed/IB-COOKIES/400/400',
    recipe: [
      { ing: 'oreo', qty: 4, unit: 'cái' },
      { ing: 'sua-dac', qty: 60, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 90, unit: 'ml' },
      { ing: 'sot-choco', qty: 10, unit: 'ml' },
    ],
  },

  // ── TRÀ SỮA & SÔ-CÔ-LA ─────────────────────────────────────────────────
  {
    code: 'MC-TCA-DA', name: 'Trà Xanh Sữa (Đá)', cat: 'CAT-MILKCHOCO', price: 49000,
    imageUrl: 'https://picsum.photos/seed/MC-TCA-DA/400/400',
    recipe: [
      { ing: 'bot-tca', qty: 2, unit: 'muỗng' },
      { ing: 'sua-dac', qty: 40, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 90, unit: 'ml' },
    ],
  },
  {
    code: 'MC-SCL-DA', name: 'Sô Cô La Sữa (Đá)', cat: 'CAT-MILKCHOCO', price: 49000,
    imageUrl: 'https://picsum.photos/seed/MC-SCL-DA/400/400',
    recipe: [
      { ing: 'bot-soco', qty: 2, unit: 'muỗng' },
      { ing: 'sua-dac', qty: 40, unit: 'ml' },
      { ing: 'sua-tuoi', qty: 90, unit: 'ml' },
    ],
  },
  {
    code: 'MC-TCA-NONG', name: 'Trà Xanh Sữa (Nóng)', cat: 'CAT-MILKCHOCO', price: 49000,
    imageUrl: 'https://picsum.photos/seed/MC-TCA-NONG/400/400',
    recipe: [
      { ing: 'bot-tca', qty: 2, unit: 'muỗng' },
      { ing: 'sua-tuoi', qty: 200, unit: 'ml' },
    ],
  },
  {
    code: 'MC-SCL-NONG', name: 'Sô Cô La Sữa (Nóng)', cat: 'CAT-MILKCHOCO', price: 49000,
    imageUrl: 'https://picsum.photos/seed/MC-SCL-NONG/400/400',
    recipe: [
      { ing: 'bot-soco', qty: 2, unit: 'muỗng' },
      { ing: 'sua-tuoi', qty: 200, unit: 'ml' },
    ],
  },
]

async function main() {
  // 1. Upsert categories
  console.log('Seeding categories...')
  const catMap: Record<string, string> = {}
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: { code: c.code, name: c.name, isActive: true },
    })
    catMap[c.code] = cat.id
  }
  console.log(`  ${CATEGORIES.length} categories done.`)

  // 2. Build ingredient code → id map
  console.log('Loading ingredients...')
  const ingAll = await prisma.ingredient.findMany({ select: { id: true, code: true } })
  const ingByCode: Record<string, string> = {}
  for (const i of ingAll) ingByCode[i.code] = i.id

  // 3. Upsert products + recipes
  console.log(`Seeding ${PRODUCTS.length} products...`)
  let ok = 0, skipped = 0
  for (const p of PRODUCTS) {
    const catId = catMap[p.cat]
    if (!catId) { console.warn(`  SKIP ${p.code}: category ${p.cat} not found`); skipped++; continue }

    const prod = await prisma.product.upsert({
      where: { code: p.code },
      update: { name: p.name, price: money(p.price), imageUrl: p.imageUrl, categoryId: catId },
      create: {
        code: p.code, name: p.name, type: 'Đồ uống',
        unit: 'ly', price: money(p.price),
        imageUrl: p.imageUrl, isActive: true, categoryId: catId,
      },
    })

    // Delete old recipes then re-insert
    await prisma.productRecipe.deleteMany({ where: { productId: prod.id } })

    for (const r of p.recipe) {
      const ingCode = ING[r.ing]
      if (!ingCode) { console.warn(`    no ING key: ${r.ing}`); continue }
      const ingId = ingByCode[ingCode]
      if (!ingId) { console.warn(`    ingredient not in DB: ${ingCode}`); continue }

      // ProductRecipe has unique(productId, ingredientId) — skip if same ingredient appears twice
      await prisma.productRecipe.upsert({
        where: { productId_ingredientId: { productId: prod.id, ingredientId: ingId } },
        update: { quantity: qty(r.qty), unit: r.unit },
        create: { productId: prod.id, ingredientId: ingId, quantity: qty(r.qty), unit: r.unit, wastePercent: qty(0) },
      })
    }
    ok++
  }

  console.log(`Done: ${ok} products seeded, ${skipped} skipped.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
