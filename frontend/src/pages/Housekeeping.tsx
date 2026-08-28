import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRooms, updateRoomStatus, type Room, type HousekeepingStatus } from '../api/rooms'

const STATUSES: HousekeepingStatus[] = ['CLEAN', 'DIRTY', 'INSPECTING', 'OUT_OF_SERVICE']

const STATUS_COLOR: Record<HousekeepingStatus, string> = {
  CLEAN: 'bg-emerald-100 text-emerald-800',
  DIRTY: 'bg-amber-100 text-amber-800',
  INSPECTING: 'bg-sky-100 text-sky-800',
  OUT_OF_SERVICE: 'bg-red-100 text-red-800',
}

function AlertBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
      {message}
    </div>
  )
}

function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

function groupByRoomType(rooms: Room[]): Array<[string, Room[]]> {
  const groups = new Map<string, Room[]>()
  for (const room of rooms) {
    const list = groups.get(room.roomTypeName) ?? []
    list.push(room)
    groups.set(room.roomTypeName, list)
  }
  return Array.from(groups.entries())
}

export function Housekeeping() {
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listRooms()
      .then((data) => {
        if (!cancelled) setRooms(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(messageFor(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleStatusChange(room: Room, next: HousekeepingStatus) {
    if (next === room.housekeepingStatus) return
    const previous = rooms
    setSavingId(room.id)
    setRowErrors((prev) => ({ ...prev, [room.id]: '' }))
    // Optimistic update.
    setRooms((current) =>
      (current ?? []).map((r) => (r.id === room.id ? { ...r, housekeepingStatus: next } : r))
    )
    try {
      const updated = await updateRoomStatus(room.id, next)
      // PATCH's response doesn't include roomTypeName (the backend only returns
      // the fields it actually touched) — merge onto the existing row instead of
      // replacing it wholesale, or the room silently drops out of its group.
      setRooms((current) => (current ?? []).map((r) => (r.id === room.id ? { ...r, ...updated } : r)))
    } catch (err) {
      // Revert on failure — never leave the UI showing a status that didn't
      // actually persist.
      setRooms(previous)
      setRowErrors((prev) => ({ ...prev, [room.id]: messageFor(err) }))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">Housekeeping</h1>
          <Link to="/dashboard" className="text-sm text-slate-700 underline">
            Back
          </Link>
        </div>

        {loadError && <AlertBox message={loadError} />}
        {!loadError && rooms === null && <p className="text-sm text-slate-500">Loading…</p>}
        {rooms !== null && rooms.length === 0 && (
          <p className="text-sm text-slate-500">No rooms found for your hotel.</p>
        )}

        {rooms !== null &&
          groupByRoomType(rooms).map(([roomTypeName, groupRooms]) => (
            <div key={roomTypeName} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-600">{roomTypeName}</h2>
              <ul className="space-y-2">
                {groupRooms.map((room) => (
                  <li key={room.id} className="rounded-lg bg-white p-3 shadow">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">{room.label}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[room.housekeepingStatus]}`}
                      >
                        {room.housekeepingStatus}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={savingId === room.id}
                          onClick={() => handleStatusChange(room, status)}
                          className={`min-h-[44px] rounded border px-2 py-2 text-xs font-medium disabled:opacity-50 ${
                            status === room.housekeepingStatus
                              ? 'border-slate-800 bg-slate-800 text-white'
                              : 'border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                    {rowErrors[room.id] && (
                      <div className="mt-2">
                        <AlertBox message={rowErrors[room.id]} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  )
}
