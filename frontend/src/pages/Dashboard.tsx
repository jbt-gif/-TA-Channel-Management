import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchRoomTypes, fetchCalendar, type RoomType, type CalendarResponse } from '../api/roomTypes'
import { fetchSyncStatus } from '../api/syncStatus'
import { CalendarGrid } from '../components/CalendarGrid'
import { BookingForm } from '../components/BookingForm'

const ADMIN_ROLES = new Set(['HOTEL_ADMIN', 'SUPER_ADMIN'])
const HOUSEKEEPING_LINK_ROLES = new Set(['HOUSEKEEPING', 'HOTEL_ADMIN', 'SUPER_ADMIN'])

const WEEK_DAYS = 7
const WINDOW_DAYS = 14

// Manila-anchored "today," mirroring src/lib/seed-inventory.ts's
// getManilaToday() convention (+8h offset, then UTC-midnight). Deliberately
// NOT derived from the browser's local timezone — the backend's entire date
// model is Manila-anchored, and a staff device with a different system
// timezone must not silently disagree with it.
function todayManilaStr(): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000
  return new Date(manilaMs).toISOString().slice(0, 10)
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function Dashboard() {
  const { user, logout } = useAuth()

  const [failedSyncCount, setFailedSyncCount] = useState(0)

  useEffect(() => {
    if (!user?.role || !ADMIN_ROLES.has(user.role)) return
    let cancelled = false
    fetchSyncStatus()
      .then((result) => {
        if (!cancelled) setFailedSyncCount(result.counts.FAILED)
      })
      .catch(() => {
        // Silent — the badge is a convenience indicator, not the sync-status
        // page's own error surface. A failed fetch here just means no badge.
      })
    return () => {
      cancelled = true
    }
  }, [user?.role])

  const [roomTypes, setRoomTypes] = useState<RoomType[] | null>(null)
  const [roomTypesError, setRoomTypesError] = useState<string | null>(null)
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string | null>(null)

  const [startDate, setStartDate] = useState<string>(() => todayManilaStr())
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)

  // Bumped after a successful booking to trigger the exact same calendar
  // fetch effect below — reuses the fetch/AbortController logic verbatim
  // instead of duplicating a second copy of it.
  const [refreshKey, setRefreshKey] = useState(0)

  // While a booking submission is in flight, the room-type selector and week
  // navigation are disabled — switching selection mid-submission would cause
  // the post-success refresh to update the WRONG room type/week's grid,
  // silently leaving the actually-booked one stale.
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadRoomTypes() {
      try {
        const data = await fetchRoomTypes()
        if (cancelled) return
        setRoomTypes(data)
        if (data.length > 0) setSelectedRoomTypeId(data[0].id)
      } catch {
        if (!cancelled) setRoomTypesError('Unable to load room types.')
      }
    }
    void loadRoomTypes()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedRoomTypeId) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const endDate = addDaysStr(startDate, WINDOW_DAYS - 1)
    setCalendarLoading(true)
    setCalendarError(null)

    fetchCalendar(selectedRoomTypeId, startDate, endDate, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setCalendar(data)
        setCalendarLoading(false)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setCalendarError(err instanceof Error ? err.message : 'Unable to load the calendar.')
        setCalendarLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [selectedRoomTypeId, startDate, refreshKey])

  const selectedRoomType = roomTypes?.find((rt) => rt.id === selectedRoomTypeId) ?? null

  // A booking form default that could silently be a past date (if staff had
  // navigated Prev-week before opening the form) would fail the single most
  // common interaction — accept the default, submit — every time.
  const defaultCheckInDate = startDate < todayManilaStr() ? todayManilaStr() : startDate

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow">
          <div className="text-sm text-slate-700">
            <span className="font-medium">Hotel:</span> {user?.hotelId} &nbsp;·&nbsp;{' '}
            <span className="font-medium">Role:</span> {user?.role}
          </div>
          <div className="flex items-center gap-3">
            {user?.role && ADMIN_ROLES.has(user.role) && (
              <Link to="/admin" className="text-sm text-slate-700 underline">
                Manage
              </Link>
            )}
            {user?.role && HOUSEKEEPING_LINK_ROLES.has(user.role) && (
              <Link to="/housekeeping" className="text-sm text-slate-700 underline">
                Housekeeping
              </Link>
            )}
            {user?.role && ADMIN_ROLES.has(user.role) && failedSyncCount > 0 && (
              <Link
                to="/sync-status"
                className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
              >
                ⚠ {failedSyncCount} sync issue{failedSyncCount === 1 ? '' : 's'}
              </Link>
            )}
            <button
              type="button"
              onClick={logout}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              Log out
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          {roomTypesError && (
            <div role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {roomTypesError}
            </div>
          )}

          {!roomTypesError && roomTypes === null && (
            <p className="text-sm text-slate-500">Loading room types…</p>
          )}

          {!roomTypesError && roomTypes !== null && roomTypes.length === 0 && (
            <p className="text-sm text-slate-500">No room types configured yet.</p>
          )}

          {!roomTypesError && roomTypes !== null && roomTypes.length > 0 && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-slate-700" htmlFor="room-type-select">
                  Room type
                </label>
                <select
                  id="room-type-select"
                  value={selectedRoomTypeId ?? ''}
                  disabled={isBookingSubmitting}
                  onChange={(e) => setSelectedRoomTypeId(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
                >
                  {roomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name}
                    </option>
                  ))}
                </select>

                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    disabled={isBookingSubmitting}
                    onClick={() => setStartDate((d) => addDaysStr(d, -WEEK_DAYS))}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    ← Prev week
                  </button>
                  <button
                    type="button"
                    disabled={isBookingSubmitting}
                    onClick={() => setStartDate((d) => addDaysStr(d, WEEK_DAYS))}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Next week →
                  </button>
                </div>
              </div>

              {calendarError && (
                <div role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {calendarError}
                </div>
              )}

              {!calendarError && calendarLoading && (
                <p className="text-sm text-slate-500">Loading calendar…</p>
              )}

              {!calendarError && !calendarLoading && calendar && <CalendarGrid data={calendar} />}
            </>
          )}
        </div>

        {selectedRoomType && user?.role !== 'HOUSEKEEPING' && (
          <BookingForm
            roomTypeId={selectedRoomType.id}
            ratePlans={selectedRoomType.ratePlans}
            defaultCheckInDate={defaultCheckInDate}
            onBookingSuccess={() => setRefreshKey((k) => k + 1)}
            onSubmittingChange={setIsBookingSubmitting}
          />
        )}
      </div>
    </div>
  )
}
