import { apiFetch } from '../lib/api'

export interface SyncStatusCounts {
  PENDING: number
  PROCESSING: number
  DONE: number
  FAILED: number
}

export interface FailedPushRow {
  id: string
  type: 'AVAILABILITY' | 'RATE'
  roomTypeId: string | null
  ratePlanId: string | null
  roomTypeName: string | null
  ratePlanName: string | null
  dateFrom: string
  dateTo: string
  attempts: number
  lastError: string | null
  updatedAt: string
}

export interface SyncStatusResult {
  counts: SyncStatusCounts
  failed: FailedPushRow[]
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

export async function fetchSyncStatus(): Promise<SyncStatusResult> {
  const res = await apiFetch('/sync-status')
  if (res.status === 200) return (await res.json()) as SyncStatusResult
  return parseErrorResponse(res)
}

export async function retryPush(id: string): Promise<FailedPushRow> {
  const res = await apiFetch(`/sync-status/${id}/retry`, { method: 'POST' })
  if (res.status === 200) return (await res.json()) as FailedPushRow
  return parseErrorResponse(res)
}
