import { apiFetch } from '../lib/api'

export type HousekeepingStatus = 'CLEAN' | 'DIRTY' | 'INSPECTING' | 'OUT_OF_SERVICE'

export interface Room {
  id: string
  label: string
  roomTypeId: string
  roomTypeName: string
  housekeepingStatus: HousekeepingStatus
  lastChangedByUserId: string | null
  lastChangedAt: string | null
}

export class ValidationError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}
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
  // 401 is already handled by apiFetch (throws UnauthorizedError + clears token)
  throw new ServerError('Something went wrong. Please try again.')
}

export async function listRooms(): Promise<Room[]> {
  const res = await apiFetch('/rooms')
  if (res.status === 200) return (await res.json()) as Room[]
  return parseErrorResponse(res)
}

export async function updateRoomStatus(roomId: string, housekeepingStatus: HousekeepingStatus): Promise<Room> {
  const res = await apiFetch(`/rooms/${roomId}`, {
    method: 'PATCH',
    body: JSON.stringify({ housekeepingStatus }),
  })
  if (res.status === 200) return (await res.json()) as Room
  return parseErrorResponse(res)
}
