import { apiFetch, NetworkError } from '../lib/api'

export interface RoomTypeResult {
  id: string
  hotelId: string
  name: string
  baseCapacity: number
  lastModifiedByUserId: string | null
  deletedByUserId: string | null
  deletedAt: string | null
}

export interface RatePlanResult {
  id: string
  hotelId: string
  roomTypeId: string
  name: string
  isRefundable: boolean
  includesBreakfast: boolean
  /** Prisma Decimal serializes to a JSON string, not a number — always
   * Number()-parse before formatting or arithmetic. */
  basePrice: string
  lastModifiedByUserId: string | null
  deletedByUserId: string | null
  deletedAt: string | null
}

export interface PolicyResult {
  downpaymentPercent: number
}

export class ValidationError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ServerError extends Error {}

async function parseErrorResponse(res: Response): Promise<never> {
  let message = 'Request failed'
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) message = body.error
  } catch {
    // body wasn't JSON — fall back to the generic message above
  }

  if (res.status === 400) throw new ValidationError(message)
  if (res.status === 403) throw new ForbiddenError(message)
  if (res.status === 404) throw new NotFoundError(message)
  if (res.status === 409) throw new ConflictError(message)
  // 401 is already handled by apiFetch (throws UnauthorizedError + clears token)
  throw new ServerError('Something went wrong. Please try again.')
}

export async function createRoomType(input: {
  name: string
  baseCapacity: number
}): Promise<RoomTypeResult> {
  const res = await apiFetch('/room-types', { method: 'POST', body: JSON.stringify(input) })
  if (res.status === 201) return (await res.json()) as RoomTypeResult
  return parseErrorResponse(res)
}

export async function updateRoomType(
  id: string,
  input: Partial<{ name: string; baseCapacity: number }>
): Promise<RoomTypeResult> {
  const res = await apiFetch(`/room-types/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  if (res.status === 200) return (await res.json()) as RoomTypeResult
  return parseErrorResponse(res)
}

export async function deleteRoomType(id: string): Promise<void> {
  const res = await apiFetch(`/room-types/${id}`, { method: 'DELETE' })
  if (res.status === 200) return
  return parseErrorResponse(res)
}

export async function createRatePlan(
  roomTypeId: string,
  input: { name: string; isRefundable: boolean; includesBreakfast: boolean; basePrice: number }
): Promise<RatePlanResult> {
  const res = await apiFetch(`/room-types/${roomTypeId}/rate-plans`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (res.status === 201) return (await res.json()) as RatePlanResult
  return parseErrorResponse(res)
}

export async function updateRatePlan(
  id: string,
  input: Partial<{ name: string; isRefundable: boolean; includesBreakfast: boolean; basePrice: number }>
): Promise<RatePlanResult> {
  const res = await apiFetch(`/rate-plans/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  if (res.status === 200) return (await res.json()) as RatePlanResult
  return parseErrorResponse(res)
}

export async function deleteRatePlan(id: string): Promise<void> {
  const res = await apiFetch(`/rate-plans/${id}`, { method: 'DELETE' })
  if (res.status === 200) return
  return parseErrorResponse(res)
}

export async function getPolicy(): Promise<PolicyResult> {
  const res = await apiFetch('/hotel/policy')
  if (res.status === 200) return (await res.json()) as PolicyResult
  return parseErrorResponse(res)
}

export async function updatePolicy(downpaymentPercent: number): Promise<PolicyResult> {
  const res = await apiFetch('/hotel/policy', {
    method: 'PATCH',
    body: JSON.stringify({ downpaymentPercent }),
  })
  if (res.status === 200) return (await res.json()) as PolicyResult
  return parseErrorResponse(res)
}

export { NetworkError }
