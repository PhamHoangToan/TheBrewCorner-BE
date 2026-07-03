// Chuyển đổi đơn vị recipe (ml, g, muỗng, vá, viên…) sang đơn vị kho (chai, kg, hộp…)
// usagePerUnit = số ml/g trong 1 đơn vị tồn kho (VD 1 chai = 1000 ml → usagePerUnit = 1000)

const toMl = (qty: number, unit: string): number | null => {
  switch (unit) {
    case 'ml': return qty
    case 'lít': case 'lit': case 'l': return qty * 1000
    case 'muỗng': return qty * 5     // 1 muỗng cà phê ≈ 5 ml
    case 'vá': return qty * 50       // 1 vá topping ≈ 50 ml
    default: return null
  }
}

const toGram = (qty: number, unit: string): number | null => {
  switch (unit) {
    case 'g': return qty
    case 'kg': return qty * 1000
    case 'muỗng': return qty * 5     // 1 muỗng ≈ 5 g
    default: return null
  }
}

export const convertToStockUnit = (qty: number, recipeUnit: string, stockUnit: string, usagePerUnit: number): number => {
  const ru = recipeUnit.toLowerCase().trim()
  const su = stockUnit.toLowerCase().trim()

  // Cùng đơn vị: không cần convert
  if (ru === su) return qty / usagePerUnit

  // Đơn vị thể tích → container (chai, lít, l)
  const mlValue = toMl(qty, ru)
  if (mlValue !== null && ['chai', 'lít', 'lit', 'l', 'ml'].includes(su)) {
    const stockMlPerUnit = su === 'ml' ? 1 : usagePerUnit
    return mlValue / stockMlPerUnit
  }

  // Đơn vị khối lượng → container (kg, g, hộp, gói)
  const gValue = toGram(qty, ru)
  if (gValue !== null && ['kg', 'g', 'hộp', 'gói', 'lon'].includes(su)) {
    const stockGPerUnit = su === 'g' ? 1 : usagePerUnit
    return gValue / stockGPerUnit
  }

  // Đơn vị đếm (viên, cái, trái, lá, vá, muỗng…) → chia usagePerUnit
  return qty / usagePerUnit
}
