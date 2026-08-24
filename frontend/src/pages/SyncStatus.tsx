import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchSyncStatus, retryPush, type SyncStatusResult } from '../api/syncStatus'

const ADMIN_ROLES = new Set(['HOTEL_ADMIN', 'SUPER_ADMIN'])

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

export function SyncStatus() {
  const { user } = useAuth()

  const [data, setData] = useState<SyncStatusResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchSyncStatus()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(messageFor(err))
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // Same reasoning as Admin.tsx's own role check — the "Manage" link being
  // hidden isn't itself the security boundary (the backend's 403 is), but a
  // non-admin typing /sync-status directly should still land somewhere sane.
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleRetry(id: string) {
    setRetryError(null)
    setRetryingId(id)
    try {
      await retryPush(id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setRetryError(messageFor(err))
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-800">Channex sync status</h1>
          <Link to="/dashboard" className="text-sm text-slate-700 underline">
            Back to dashboard
          </Link>
        </div>

        {loadError && <AlertBox message={loadError} />}

        {!loadError && data === null && <p className="text-sm text-slate-500">Loading…</p>}

        {data && (
          <>
            <div className="grid grid-cols-4 gap-3">
              {(['PENDING', 'PROCESSING', 'DONE', 'FAILED'] as const).map((status) => (
                <div key={status} className="rounded-lg bg-white p-4 shadow">
                  <div className="text-xs font-medium text-slate-500">{status}</div>
                  <div className="text-2xl font-semibold text-slate-800">{data.counts[status]}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-white p-4 shadow">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Failed pushes</h2>

              {retryError && <div className="mb-3"><AlertBox message={retryError} /></div>}

              {data.failed.length === 0 && (
                <p className="text-sm text-slate-500">No failed pushes.</p>
              )}

              {data.failed.length > 0 && (
                <ul className="space-y-3">
                  {data.failed.map((row) => (
                    <li key={row.id} className="rounded border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm">
                          <div className="font-medium text-slate-800">
                            {row.type === 'RATE' ? row.ratePlanName : row.roomTypeName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.type} · {row.dateFrom.slice(0, 10)} to {row.dateTo.slice(0, 10)} · {row.attempts} attempts
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={retryingId === row.id}
                          onClick={() => handleRetry(row.id)}
                          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {retryingId === row.id ? 'Retrying…' : 'Retry'}
                        </button>
                      </div>
                      {row.lastError && (
                        <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{row.lastError}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
