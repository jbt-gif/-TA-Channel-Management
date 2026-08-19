import type { CalendarResponse } from '../api/roomTypes'

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

function formatDateHeader(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

interface DayStatus {
  kind: 'unseeded' | 'sold-out' | 'available'
  availableCount: number | null
}

function statusFor(day: CalendarResponse['days'][number]): DayStatus {
  if (!day.seeded || day.availableCount === null || day.bookedCount === null || day.heldCount === null) {
    return { kind: 'unseeded', availableCount: null }
  }
  const remaining = day.availableCount - day.bookedCount - day.heldCount
  if (day.isClosed || remaining <= 0) {
    return { kind: 'sold-out', availableCount: remaining }
  }
  return { kind: 'available', availableCount: remaining }
}

const STATUS_CLASSES: Record<DayStatus['kind'], string> = {
  unseeded: 'bg-slate-100 text-slate-400 italic',
  'sold-out': 'bg-red-50 text-red-700 font-medium',
  available: 'bg-green-50 text-green-800',
}

export function CalendarGrid({ data }: { data: CalendarResponse }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-3 py-2 text-left font-medium text-slate-600">
              &nbsp;
            </th>
            {data.days.map((day) => (
              <th
                key={day.date}
                className="border-b border-slate-200 px-3 py-2 text-center font-medium text-slate-600"
              >
                {formatDateHeader(day.date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="sticky left-0 z-10 border-b border-slate-200 bg-white px-3 py-2 font-medium text-slate-700">
              Availability
            </td>
            {data.days.map((day) => {
              const status = statusFor(day)
              const label =
                status.kind === 'unseeded'
                  ? 'Not yet available'
                  : status.kind === 'sold-out'
                    ? 'Sold out'
                    : `${status.availableCount} free`
              return (
                <td
                  key={day.date}
                  className={`border-b border-slate-200 px-3 py-2 text-center ${STATUS_CLASSES[status.kind]}`}
                >
                  {label}
                </td>
              )
            })}
          </tr>

          {data.ratePlans.map((ratePlan) => (
            <tr key={ratePlan.id}>
              <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2 text-slate-700">
                {ratePlan.name}
              </td>
              {data.days.map((day) => {
                const status = statusFor(day)
                const rate = day.rates[ratePlan.id]

                let content: string
                if (status.kind === 'unseeded') {
                  content = '—'
                } else if (!rate) {
                  // Seeded date, but this specific rate plan has no
                  // RatePlanDailyRate row for it — never crash on
                  // rate.price, never render a blank cell that could be
                  // misread as free-of-charge.
                  content = 'No rate set'
                } else {
                  content = currencyFormatter.format(Number(rate.price))
                }

                return (
                  <td
                    key={day.date}
                    className="border-b border-slate-100 px-3 py-2 text-center text-slate-700"
                  >
                    {content}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
