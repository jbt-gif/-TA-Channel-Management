import { apiFetch, NetworkError } from '../lib/api'

export interface CreateBookingInput {
  roomTypeId: string
  ratePlanId: string
  checkInDate: string
  checkOutDate: string
  quantity: number
  guest: {
    firstName: string
    lastName: string
    email?: string
    phone?: string
  }
}

export interface BookingItemResult {
  id: string
  roomTypeId: string
  ratePlanId: string
  checkInDate: string
  checkOutDate: string
  quantity: number
  totalPriceSnapshot: string
}

export interface BookingResult {
  id: string
  hotelId: string
  guestId: string
  status: string
  source: string
  totalAmount: string
  bookingItems: BookingItemResult[]
}

export class ValidationError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class ServerError extends Error {}

/**
 * Distinct typed errors per status so the caller can show the right message
 * for each — never a single generic catch-all (AC-2). NetworkError (from
 * apiFetch) propagates unchanged for the fetch-throws case (AC-3).
 */
export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
  const res = await apiFetch('/bookings', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  if (res.status === 201) {
    return (await res.json()) as BookingResult
  }

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

export { NetworkError }
