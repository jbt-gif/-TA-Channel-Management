import { apiFetch } from '../lib/api'

export interface RatePlanSummary {
  id: string
  name: string
  isRefundable: boolean
  includesBreakfast: boolean
  /** Prisma Decimal serializes to a JSON string, not a number — always
   * Number()-parse before formatting or arithmetic. */
  basePrice: string
}

export interface RoomType {
  id: string
  name: string
  baseCapacity: number
  ratePlans: RatePlanSummary[]
}

export interface CalendarDay {
  date: string
  seeded: boolean
  availableCount: number | null
  bookedCount: number | null
  heldCount: number | null
  isClosed: boolean | null
  rates: Record<string, { price: string; minStay: number }>
}

export interface CalendarResponse {
  roomType: { id: string; name: string; baseCapacity: number }
  ratePlans: RatePlanSummary[]
  days: CalendarDay[]
}

export async function fetchRoomTypes(): Promise<RoomType[]> {
  const res = await apiFetch('/room-types')
  if (!res.ok) {
    throw new Error(`Failed to fetch room types (status ${res.status})`)
  }
  return (await res.json()) as RoomType[]
}

export async function fetchCalendar(
  roomTypeId: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal
): Promise<CalendarResponse> {
  const res = await apiFetch(
    `/room-types/${roomTypeId}/calendar?startDate=${startDate}&endDate=${endDate}`,
    { signal }
  )
  if (!res.ok) {
    // A 404 here means roomTypeId is cross-tenant or nonexistent — shouldn't
    // happen from this UI since roomTypeId always comes from fetchRoomTypes()'s
    // own results, but must not be silently swallowed if it does.
    throw new Error(`Failed to fetch calendar (status ${res.status})`)
  }
  return (await res.json()) as CalendarResponse
}
