import { useState, type FormEvent } from 'react'
import type { RatePlanSummary } from '../api/roomTypes'
import {
  createBooking,
  NetworkError,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../api/bookings'

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface BookingFormProps {
  roomTypeId: string
  ratePlans: RatePlanSummary[]
  defaultCheckInDate: string
  onBookingSuccess: () => void
  onSubmittingChange: (submitting: boolean) => void
}

export function BookingForm({
  roomTypeId,
  ratePlans,
  defaultCheckInDate,
  onBookingSuccess,
  onSubmittingChange,
}: BookingFormProps) {
  const [ratePlanId, setRatePlanId] = useState(ratePlans[0]?.id ?? '')
  const [checkInDate, setCheckInDate] = useState(defaultCheckInDate)
  const [checkOutDate, setCheckOutDate] = useState(addDaysStr(defaultCheckInDate, 1))
  const [quantity, setQuantity] = useState(1)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (ratePlans.length === 0) {
    return (
      <div className="rounded-lg bg-white p-4 shadow">
        <p className="text-sm text-slate-500">No rate plans configured for this room type yet.</p>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)
    onSubmittingChange(true)

    try {
      const booking = await createBooking({
        roomTypeId,
        ratePlanId,
        checkInDate,
        checkOutDate,
        quantity,
        guest: {
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
        },
      })
      setSuccess(`Booking confirmed — total ${currencyFormatter.format(Number(booking.totalAmount))}`)
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      onBookingSuccess()
    } catch (err) {
      if (err instanceof NetworkError) {
        setError('Unable to reach the server. Please try again.')
      } else if (
        err instanceof ValidationError ||
        err instanceof ForbiddenError ||
        err instanceof NotFoundError ||
        err instanceof ConflictError
      ) {
        setError(err.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
      onSubmittingChange(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg bg-white p-4 shadow">
      <h2 className="text-sm font-semibold text-slate-800">New walk-in booking</h2>

      {error && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="rate-plan">
            Rate plan
          </label>
          <select
            id="rate-plan"
            value={ratePlanId}
            onChange={(e) => setRatePlanId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            {ratePlans.map((rp) => (
              <option key={rp.id} value={rp.id}>
                {rp.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="check-in">
            Check-in
          </label>
          <input
            id="check-in"
            type="date"
            required
            value={checkInDate}
            onChange={(e) => setCheckInDate(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="check-out">
            Check-out
          </label>
          <input
            id="check-out"
            type="date"
            required
            value={checkOutDate}
            onChange={(e) => setCheckOutDate(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="quantity">
            Rooms
          </label>
          <input
            id="quantity"
            type="number"
            min="1"
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="guest-first-name">
            Guest first name
          </label>
          <input
            id="guest-first-name"
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="guest-last-name">
            Guest last name
          </label>
          <input
            id="guest-last-name"
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="guest-email">
            Email (optional)
          </label>
          <input
            id="guest-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="guest-phone">
            Phone (optional)
          </label>
          <input
            id="guest-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? 'Booking…' : 'Create booking'}
      </button>
    </form>
  )
}
