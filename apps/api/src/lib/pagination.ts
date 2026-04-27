const MAX_LIMIT = 25

export function parsePagination(
  query: { page?: string; limit?: string },
  defaultLimit = 10
) {
  const page = Math.max(1, parseInt(query.page || '1'))
  const limit = Math.max(1, Math.min(parseInt(query.limit || String(defaultLimit)), MAX_LIMIT))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export function paginationResponse(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }
}
