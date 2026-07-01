export type QueryParams = {
  page?: string
  limit?: string
  search?: string
  [key: string]: string | undefined
}

export const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const pagination = (query: QueryParams) => {
  const page = Math.max(toNumber(query.page, 1), 1)
  const limit = Math.min(Math.max(toNumber(query.limit, 20), 1), 100)

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  }
}

export const money = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined
  return Number(value)
}
