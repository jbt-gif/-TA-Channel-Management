import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchRoomTypes, type RoomType, type RatePlanSummary } from '../api/roomTypes'
import {
  createRoomType,
  updateRoomType,
  deleteRoomType,
  createRatePlan,
  updateRatePlan,
  deleteRatePlan,
  getPolicy,
  updatePolicy,
  NetworkError,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../api/admin'

const currencyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const ADMIN_ROLES = new Set(['HOTEL_ADMIN', 'SUPER_ADMIN'])

function messageFor(err: unknown): string {
  if (err instanceof NetworkError) return 'Unable to reach the server. Please try again.'
  if (
    err instanceof ValidationError ||
    err instanceof ForbiddenError ||
    err instanceof NotFoundError ||
    err instanceof ConflictError
  ) {
    return err.message
  }
  return 'Something went wrong. Please try again.'
}

function AlertBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
      {message}
    </div>
  )
}

interface NewRoomTypeFormProps {
  onCreated: () => void
}

function NewRoomTypeForm({ onCreated }: NewRoomTypeFormProps) {
  const [name, setName] = useState('')
  const [baseCapacity, setBaseCapacity] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await createRoomType({ name, baseCapacity })
      setName('')
      setBaseCapacity(1)
      onCreated()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded border border-slate-200 p-3">
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="new-rt-name">
          New room type name
        </label>
        <input
          id="new-rt-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="new-rt-capacity">
          Base capacity
        </label>
        <input
          id="new-rt-capacity"
          type="number"
          min="1"
          required
          value={baseCapacity}
          onChange={(e) => setBaseCapacity(Number(e.target.value))}
          className="mt-1 w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? 'Creating…' : 'Create room type'}
      </button>
      {error && <AlertBox message={error} />}
    </form>
  )
}

interface RoomTypeRowProps {
  roomType: RoomType
  onChanged: () => void
}

function RoomTypeRow({ roomType, onChanged }: RoomTypeRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  // Initialized only when edit mode is entered (see startEdit) — NOT resynced
  // from props on every render. A page-level refetch triggered by an
  // unrelated action must not silently clobber an in-progress unsaved edit
  // here (audit-added AC-9).
  const [name, setName] = useState(roomType.name)
  const [baseCapacity, setBaseCapacity] = useState(roomType.baseCapacity)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setName(roomType.name)
    setBaseCapacity(roomType.baseCapacity)
    setError(null)
    setIsEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await updateRoomType(roomType.id, { name, baseCapacity })
      setIsEditing(false)
      onChanged()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete room type "${roomType.name}"? This cannot be undone.`)) return
    setError(null)
    setIsSubmitting(true)
    try {
      await deleteRoomType(roomType.id)
      onChanged()
    } catch (err) {
      setError(messageFor(err))
      setIsSubmitting(false)
    }
  }

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2 rounded bg-slate-50 p-2">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <input
          type="number"
          min="1"
          required
          value={baseCapacity}
          onChange={(e) => setBaseCapacity(Number(e.target.value))}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => setIsEditing(false)}
          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          Cancel
        </button>
        {error && <AlertBox message={error} />}
      </form>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-slate-800">{roomType.name}</span>
      <span className="text-xs text-slate-500">(capacity {roomType.baseCapacity})</span>
      <button type="button" onClick={startEdit} className="text-xs text-slate-600 underline">
        Edit
      </button>
      <button
        type="button"
        disabled={isSubmitting}
        onClick={handleDelete}
        className="text-xs text-red-600 underline disabled:opacity-50"
      >
        Delete
      </button>
      {error && <AlertBox message={error} />}
    </div>
  )
}

interface NewRatePlanFormProps {
  roomTypeId: string
  onCreated: () => void
}

function NewRatePlanForm({ roomTypeId, onCreated }: NewRatePlanFormProps) {
  const [name, setName] = useState('')
  const [isRefundable, setIsRefundable] = useState(false)
  const [includesBreakfast, setIncludesBreakfast] = useState(false)
  const [basePrice, setBasePrice] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await createRatePlan(roomTypeId, { name, isRefundable, includesBreakfast, basePrice })
      setName('')
      setIsRefundable(false)
      setIncludesBreakfast(false)
      setBasePrice(0)
      onCreated()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ml-4 flex flex-wrap items-end gap-2 rounded border border-slate-200 p-2">
      <input
        type="text"
        placeholder="New rate plan name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input type="checkbox" checked={isRefundable} onChange={(e) => setIsRefundable(e.target.checked)} />
        Refundable
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={includesBreakfast}
          onChange={(e) => setIncludesBreakfast(e.target.checked)}
        />
        Breakfast
      </label>
      <input
        type="number"
        min="0.01"
        step="0.01"
        required
        placeholder="Base price"
        value={basePrice || ''}
        onChange={(e) => setBasePrice(Number(e.target.value))}
        className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? 'Creating…' : 'Create rate plan'}
      </button>
      {error && <AlertBox message={error} />}
    </form>
  )
}

interface RatePlanRowProps {
  ratePlan: RatePlanSummary
  onChanged: () => void
}

function RatePlanRow({ ratePlan, onChanged }: RatePlanRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(ratePlan.name)
  const [isRefundable, setIsRefundable] = useState(ratePlan.isRefundable)
  const [includesBreakfast, setIncludesBreakfast] = useState(ratePlan.includesBreakfast)
  const [basePrice, setBasePrice] = useState(Number(ratePlan.basePrice))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setName(ratePlan.name)
    setIsRefundable(ratePlan.isRefundable)
    setIncludesBreakfast(ratePlan.includesBreakfast)
    setBasePrice(Number(ratePlan.basePrice))
    setError(null)
    setIsEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await updateRatePlan(ratePlan.id, { name, isRefundable, includesBreakfast, basePrice })
      setIsEditing(false)
      onChanged()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete rate plan "${ratePlan.name}"? This cannot be undone.`)) return
    setError(null)
    setIsSubmitting(true)
    try {
      await deleteRatePlan(ratePlan.id)
      onChanged()
    } catch (err) {
      setError(messageFor(err))
      setIsSubmitting(false)
    }
  }

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="ml-4 flex flex-wrap items-end gap-2 rounded bg-slate-50 p-2">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={isRefundable} onChange={(e) => setIsRefundable(e.target.checked)} />
          Refundable
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={includesBreakfast}
            onChange={(e) => setIncludesBreakfast(e.target.checked)}
          />
          Breakfast
        </label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          required
          value={basePrice}
          onChange={(e) => setBasePrice(Number(e.target.value))}
          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => setIsEditing(false)}
          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          Cancel
        </button>
        {error && <AlertBox message={error} />}
      </form>
    )
  }

  return (
    <div className="ml-4 flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-700">{ratePlan.name}</span>
      <span className="text-xs text-slate-500">{currencyFormatter.format(Number(ratePlan.basePrice))}</span>
      {ratePlan.isRefundable && <span className="text-xs text-slate-400">refundable</span>}
      {ratePlan.includesBreakfast && <span className="text-xs text-slate-400">breakfast</span>}
      <button type="button" onClick={startEdit} className="text-xs text-slate-600 underline">
        Edit
      </button>
      <button
        type="button"
        disabled={isSubmitting}
        onClick={handleDelete}
        className="text-xs text-red-600 underline disabled:opacity-50"
      >
        Delete
      </button>
      {error && <AlertBox message={error} />}
    </div>
  )
}

function PolicySection() {
  const [downpaymentPercent, setDownpaymentPercent] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPolicy()
      .then((res) => {
        if (!cancelled) setDownpaymentPercent(res.downpaymentPercent)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(messageFor(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (downpaymentPercent === null) return
    setSaveError(null)
    setSaved(false)
    setIsSubmitting(true)
    try {
      const res = await updatePolicy(downpaymentPercent)
      setDownpaymentPercent(res.downpaymentPercent)
      setSaved(true)
    } catch (err) {
      setSaveError(messageFor(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h2 className="mb-2 text-sm font-semibold text-slate-800">Policy settings</h2>
      {loadError && <AlertBox message={loadError} />}
      {!loadError && downpaymentPercent === null && <p className="text-sm text-slate-500">Loading…</p>}
      {downpaymentPercent !== null && (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600" htmlFor="downpayment-percent">
              Downpayment percentage
            </label>
            <input
              id="downpayment-percent"
              type="number"
              min="0"
              max="100"
              required
              value={downpaymentPercent}
              onChange={(e) => {
                setSaved(false)
                setDownpaymentPercent(Number(e.target.value))
              }}
              className="mt-1 w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="text-xs text-green-700">Saved.</span>}
          {saveError && <AlertBox message={saveError} />}
        </form>
      )}
    </div>
  )
}

export function Admin() {
  const { user } = useAuth()

  const [roomTypes, setRoomTypes] = useState<RoomType[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchRoomTypes()
      .then((data) => {
        if (!cancelled) setRoomTypes(data)
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load room types.')
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // Role check redirects even if the "Manage" nav link is hidden — the link
  // being hidden isn't itself the security boundary (the backend's 403 is),
  // but a non-admin typing /admin directly should still land somewhere sane.
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  function refresh() {
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-lg font-semibold text-slate-800">Hotel configuration</h1>

        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Room types</h2>

          {error && <AlertBox message={error} />}
          {!error && roomTypes === null && <p className="text-sm text-slate-500">Loading…</p>}

          {roomTypes !== null && (
            <div className="space-y-4">
              <NewRoomTypeForm onCreated={refresh} />
              {roomTypes.map((rt) => (
                <div key={rt.id} className="space-y-2 rounded border border-slate-200 p-3">
                  <RoomTypeRow roomType={rt} onChanged={refresh} />
                  <div className="space-y-2">
                    {rt.ratePlans.map((rp) => (
                      <RatePlanRow key={rp.id} ratePlan={rp} onChanged={refresh} />
                    ))}
                  </div>
                  <NewRatePlanForm roomTypeId={rt.id} onCreated={refresh} />
                </div>
              ))}
            </div>
          )}
        </div>

        <PolicySection />
      </div>
    </div>
  )
}
