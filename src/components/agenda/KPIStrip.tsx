'use client'

type KPI = {
  label: string
  value: string | number
  sub: string
  tone: 'neutral' | 'good' | 'warn' | 'bad' | 'info'
  dot: string
}

const TONES = {
  neutral: { fg: '#0f172a', sub: '#64748b' },
  good:    { fg: '#065f46', sub: '#047857' },
  warn:    { fg: '#92400e', sub: '#b45309' },
  bad:     { fg: '#991b1b', sub: '#b91c1c' },
  info:    { fg: '#1e3a8a', sub: '#1d4ed8' },
}

const KPIS: KPI[] = [
  { label: 'Agendamentos',    value: '—',   sub: 'hoje',                     tone: 'neutral', dot: '#64748b' },
  { label: 'Confirmados',     value: '—',   sub: 'aguardando confirmação',   tone: 'good',    dot: '#10b981' },
  { label: 'Em atendimento',  value: '—',   sub: 'agora',                    tone: 'warn',    dot: '#f59e0b' },
  { label: 'A confirmar',     value: '—',   sub: 'enviar lembrete',          tone: 'info',    dot: '#3b82f6' },
  { label: 'Concluídos',      value: '—',   sub: 'hoje',                     tone: 'neutral', dot: '#6b7280' },
  { label: 'Risco no-show',   value: '—',   sub: 'sem confirmação +24h',     tone: 'bad',     dot: '#ef4444' },
]

const KPI_STATUS = ['', 'confirmed', 'in_progress', 'scheduled', 'completed', 'no_show']

type Props = {
  appointments: Array<{ status: string }>
  statusFilter: string
  onStatusFilter: (status: string) => void
}

export function KPIStrip({ appointments, statusFilter, onStatusFilter }: Props) {
  const total       = appointments.length
  const confirmed   = appointments.filter(a => a.status === 'confirmed').length
  const inProgress  = appointments.filter(a => a.status === 'in_progress').length
  const scheduled   = appointments.filter(a => a.status === 'scheduled').length
  const completed   = appointments.filter(a => a.status === 'completed').length
  const noShow      = appointments.filter(a => a.status === 'no_show').length

  const filled: KPI[] = [
    { ...KPIS[0], value: total },
    { ...KPIS[1], value: `${confirmed}/${total}`, sub: `${total > 0 ? Math.round(confirmed/total*100) : 0}% confirmados` },
    { ...KPIS[2], value: inProgress },
    { ...KPIS[3], value: scheduled },
    { ...KPIS[4], value: completed },
    { ...KPIS[5], value: noShow },
  ]

  return (
    <div className="flex gap-2.5 px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
      {filled.map((kpi, i) => {
        const t = TONES[kpi.tone]
        const kpiStatus = KPI_STATUS[i]
        const active = statusFilter === kpiStatus && kpiStatus !== ''
        return (
          <button
            key={kpi.label}
            onClick={() => kpiStatus ? onStatusFilter(active ? '' : kpiStatus) : undefined}
            className={`flex-1 min-w-0 bg-white border rounded-xl px-3.5 py-2.5 flex flex-col gap-1 transition-all duration-150 text-left ${
              kpiStatus ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'
            } ${active ? 'border-violet-400 shadow-sm ring-1 ring-violet-200' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: kpi.dot }} />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">{kpi.label}</span>
            </div>
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-xl font-bold leading-none" style={{ color: t.fg }}>{kpi.value}</span>
              <span className="text-[10px] font-medium truncate" style={{ color: t.sub }}>{kpi.sub}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
