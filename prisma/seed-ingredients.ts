import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()
const qty = (v: number) => new Prisma.Decimal(v)

// Nguồn: Bang_nguyen_lieu.xlsx — đơn vị tính theo quy cách đóng gói thực tế (nhập kho)
// Codes trùng trong Excel được phân biệt bằng hậu tố B/J
// Mục chưa có mã (—) được gán NLE-X001..NLE-X020
const INGREDIENTS: { code: string; name: string; unit: string }[] = [
  // Bán thành phẩm - Cà phê
  { code: 'NLE-00165',  name: 'Cà phê (đã pha)',                                      unit: 'g'     },
  // Bán thành phẩm - Fruit base
  { code: 'NLE-X001',   name: 'Mango fruit base',                                      unit: 'ml'    },
  { code: 'NLE-X002',   name: 'Strawberry fruit base',                                 unit: 'ml'    },
  // Bán thành phẩm - Kem
  { code: 'NLE-X003',   name: 'Kem vị (viên kem các loại)',                            unit: 'viên'  },
  // Bán thành phẩm - Mứt
  { code: 'NLE-X004',   name: 'Mứt mãng cầu',                                         unit: 'chai'  },
  { code: 'NLE-X005',   name: 'Mứt thơm',                                              unit: 'chai'  },
  { code: 'NLE-X006',   name: 'Mứt xoài',                                              unit: 'chai'  },
  // Bán thành phẩm - Syrup (tự nấu, không đóng gói)
  { code: 'NLE-X007',   name: 'Nước đường (syrup pha sẵn)',                            unit: 'ml'    },
  { code: 'NLE-X008',   name: 'Sugar syrup',                                           unit: 'ml'    },
  { code: 'NLE-X009',   name: 'Syrup sả cây (homemade)',                               unit: 'ml'    },
  { code: 'NLE-X010',   name: 'Đường nước (syrup đường - pha riêng cho Mangoberry)',   unit: 'ml'    },
  // Bán thành phẩm - Topping
  { code: 'NLE-00114',  name: 'Pudding sô-cô-la (đã làm)',                             unit: 'g'     },
  { code: 'NLE-X011',   name: 'Trân châu đường đen (đã sơ chế)',                       unit: 'kg'    },
  // Bán thành phẩm - Trà/Trà sữa
  { code: 'NLE-X012',   name: 'Trà sữa nền (đã pha)',                                  unit: 'ml'    },
  // Bột pha chế
  { code: 'NLE-00084',  name: 'Bột Frappe',                                            unit: 'g'     },
  { code: 'NLE-00221',  name: 'Bột Nesquik (chocolate)',                               unit: 'g'     },
  { code: 'NLE-00076',  name: 'Bột béo B-one',                                         unit: 'g'     },
  { code: 'NLE-00297',  name: 'Bột dừa (cà phê dùng pha)',                             unit: 'g'     },
  { code: 'NLE-00090',  name: 'Bột kem trứng Falu Đài Loan',                           unit: 'g'     },
  { code: 'NLE-00221B', name: 'Bột sô-cô-la',                                          unit: 'g'     },
  { code: 'NLE-00126',  name: 'Bột trà xanh',                                          unit: 'g'     },
  { code: 'NLE-00084B', name: 'Coffee spoon frappe powder',                             unit: 'g'     },
  { code: 'NLE-00128',  name: 'Muối mặn vanilla (Sea salt vanilla)',                    unit: 'g'     },
  // Cà phê
  { code: 'NLE-00227',  name: 'Cà phê ủ lạnh (coldbrew)',                              unit: 'thùng' },
  // Garnish
  { code: 'NLE-00189',  name: 'Cam khô (garnish)',                                     unit: 'hủ'   },
  { code: 'NLE-00719',  name: 'Cherry đỏ (ngâm)',                                      unit: 'hủ'   },
  { code: 'NLE-00220',  name: 'Chocolate chip + chocolate powder (viền ly)',            unit: 'g'     },
  { code: 'NLE-X013',   name: 'Color nuggets (thạch trang trí)',                        unit: 'g'     },
  { code: 'NLE-00293',  name: 'Dưa hấu (lát mỏng, garnish)',                           unit: 'trái'  },
  { code: 'NLE-00703',  name: 'Lá mint (bạc hà)',                                      unit: 'g'     },
  { code: 'NLE-00653',  name: 'Lá rau má (garnish)',                                   unit: 'kg'    },
  { code: 'NLE-X014',   name: 'Lá tía tô',                                             unit: 'g'     },
  { code: 'NLE-00964',  name: 'Táo (lát mỏng, garnish)',                               unit: 'trái'  },
  { code: 'NLE-00297B', name: 'Vụn dừa sấy khô (garnish)',                             unit: 'g'     },
  // Garnish/Trà
  { code: 'NLE-00137',  name: 'Hoa đậu biếc (tạo màu)',                                unit: 'g'     },
  // Garnish/Trái cây tươi
  { code: 'NLE-00046',  name: 'Lá basil (húng quế)',                                   unit: 'g'     },
  // Khác
  { code: 'NLE-X015',   name: 'Nước lọc',                                              unit: 'thùng' },
  { code: 'NLE-00543',  name: 'Rock salt (muối hột)',                                  unit: 'g'     },
  { code: 'NLE-X016',   name: 'Đá viên',                                               unit: 'viên'  },
  { code: 'NLE-X017',   name: 'Kombucha nguyên bản',                                   unit: 'chai'  },
  // Syrup (mua theo chai)
  { code: 'NLE-00950',  name: 'Caramel syrup',                                         unit: 'chai'  },
  { code: 'NLE-00951',  name: 'Elder flower syrup',                                    unit: 'chai'  },
  { code: 'NLE-00550',  name: 'Syrup atiso đỏ',                                        unit: 'chai'  },
  { code: 'NLE-00948',  name: 'Syrup dừa',                                             unit: 'chai'  },
  { code: 'NLE-00941',  name: 'Syrup mơ (Monin apricot)',                              unit: 'chai'  },
  { code: 'NLE-X018',   name: 'Syrup theo vị kem',                                     unit: 'chai'  },
  { code: 'NLE-00959',  name: 'Syrup vải (Lychee syrup)',                              unit: 'chai'  },
  { code: 'NLE-00961',  name: 'Syrup đào (Peach syrup)',                               unit: 'chai'  },
  // Sốt trái cây (mua theo chai)
  { code: 'NLE-01025',  name: 'Mix berries sauce (sốt dâu + sốt lý chua đen)',         unit: 'chai'  },
  { code: 'NLE-01024',  name: 'Sốt dâu',                                               unit: 'chai'  },
  { code: 'NLE-00620',  name: 'Sốt lý chua đen (Black current)',                       unit: 'chai'  },
  { code: 'NLE-01026',  name: 'Sốt me',                                                unit: 'chai'  },
  { code: 'NLE-01026B', name: 'Sốt trái me',                                           unit: 'chai'  },
  { code: 'NLE-01028',  name: 'Sốt trái vải',                                          unit: 'chai'  },
  { code: 'NLE-01028B', name: 'Sốt vải',                                               unit: 'chai'  },
  { code: 'NLE-00681',  name: 'Sốt ổi hồng & dâu',                                    unit: 'chai'  },
  { code: 'NLE-X019',   name: 'Sốt việt quất',                                         unit: 'chai'  },
  // Sốt/Bột pha chế
  { code: 'NLE-00057',  name: 'Bơ đậu phộng (Peanut butter)',                          unit: 'hủ'   },
  // Sốt/Syrup
  { code: 'NLE-00945',  name: 'Sốt chocolate',                                         unit: 'chai'  },
  // Sữa & Kem
  { code: 'H0050025',   name: 'Kem dừa',                                               unit: 'hủ'   },
  { code: 'NLE-00615',  name: 'Nước cốt dừa',                                          unit: 'hủ'   },
  { code: 'NLE-00916',  name: 'Sữa chua (hũ)',                                         unit: 'hũ'    },
  { code: 'NLE-00924',  name: 'Sữa tươi',                                              unit: 'hộp'  },
  { code: 'NLE-00919',  name: 'Sữa đặc',                                               unit: 'hộp'  },
  { code: 'NLE-00411',  name: 'Whipping cream',                                        unit: 'g'     },
  { code: 'NLE-00916B', name: 'Yaua Vinamilk không đường (Yoghurt)',                   unit: 'hủ'   },
  // Topping
  { code: 'NLE-00219',  name: 'Hạt chia',                                              unit: 'g'     },
  { code: 'NLE-00595',  name: 'Trân châu caramen (3Q Jelly)',                          unit: 'kg'    },
  { code: 'NLE-00002',  name: 'Trân châu trắng (topping)',                             unit: 'kg'    },
  { code: 'NLE-X020',   name: 'Bánh Oreo',                                             unit: 'cái'   },
  // Topping/Khác
  { code: 'NLE-00601',  name: 'Nha đam',                                               unit: 'g'     },
  // Trà
  { code: 'NLE-00137B', name: 'Hoa đậu biếc',                                         unit: 'g'     },
  { code: 'NLE-00398',  name: 'Hồng trà',                                              unit: 'hộp'  },
  { code: 'NLE-01019',  name: 'Trà Lài (Jasmine tea)',                                 unit: 'hộp'  },
  { code: 'NLE-01021',  name: 'Trà Oolong rang',                                       unit: 'g'     },
  { code: 'NLE-01015',  name: 'Trà đen Lộc Phát',                                     unit: 'g'     },
  { code: 'NLE-01014',  name: 'Trà đào',                                               unit: 'hộp'  },
  // Trái cây tươi (mua theo kg/trái)
  { code: 'NLE-00135',  name: 'Bưởi (múi)',                                            unit: 'kg'    },
  { code: 'NLE-00641',  name: 'Cam (trái/lát/múi)',                                    unit: 'kg'    },
  { code: 'NLE-00222',  name: 'Chuối (trái)',                                          unit: 'trái'  },
  { code: 'NLE-00281',  name: 'Dâu tây (trái)',                                        unit: 'trái'  },
  { code: 'NLE-00978',  name: 'Thanh long ruột đỏ',                                    unit: 'g'     },
  { code: 'NLE-00062',  name: 'Trái bơ',                                               unit: 'trái'  },
  { code: 'NLE-01076',  name: 'Xoài (trái/múi)',                                       unit: 'kg'    },
  // Trái cây tươi (đã ép) - mua nguyên trái theo kg rồi ép
  { code: 'NLE-00135J', name: 'Nước ép bưởi',                                         unit: 'kg'    },
  { code: 'NLE-00641J', name: 'Nước ép cam',                                           unit: 'kg'    },
  { code: 'NLE-00293J', name: 'Nước ép dưa hấu',                                      unit: 'kg'    },
  { code: 'NLE-00680',  name: 'Nước ép thơm',                                          unit: 'kg'    },
  { code: 'NLE-00964J', name: 'Nước ép táo',                                           unit: 'kg'    },
  // Trái cây tươi/Nước cốt
  { code: 'NLE-00461',  name: 'Nước chanh',                                            unit: 'kg'    },
  { code: 'NLE-00962',  name: 'Nước tắc (kumquat juice)',                              unit: 'g'     },
  // Trái cây/Nguyên liệu tươi
  { code: 'NLE-00653B', name: 'Rau má',                                                unit: 'kg'    },
  { code: 'NLE-00286',  name: 'Đậu xanh nấu chín',                                    unit: 'kg'    },
  // Trái cây/Thảo mộc tươi
  { code: 'NLE-00875',  name: 'Sả cây',                                                unit: 'g'     },
  // Đường
  { code: 'NLE-00316',  name: 'Đường cát trắng',                                      unit: 'g'     },
  // Đường/Syrup
  { code: 'NLE-00884',  name: 'Black sugar (đường đen rưới)',                          unit: 'ml'    },
]

async function main() {
  console.log(`Upserting ${INGREDIENTS.length} ingredients...`)

  for (const ing of INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { code: ing.code },
      update: { name: ing.name, unit: ing.unit },
      create: {
        code: ing.code,
        name: ing.name,
        unit: ing.unit,
        stockQuantity: qty(0),
        minQuantity: qty(0),
        isActive: true,
      },
    })
  }

  console.log(`Done: ${INGREDIENTS.length} ingredients upserted.`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
