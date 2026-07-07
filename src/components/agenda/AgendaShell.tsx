'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { api } from '@/lib/client'
import { AgendaHeader } from './AgendaHeader'
import { AgendaSidebar } from './AgendaSidebar'
import { KPIStrip } from './KPIStrip'
import { DailyView } from './views/DailyView'
import { WeeklyView } from './views/WeeklyView'
import { ListView } from './views/ListView'
import { AppointmentPopover } from './AppointmentPopover'
import { FilterChips, type FilterChip } from './FilterChips'
import { NewAppointmentModal } from './modals/NewAppointmentModal'
import { RescheduleModal } from './modals/RescheduleModal'
import { useAppointments, type Appointment } from '@/hooks/useAppointments'
import { useDentists } from '@/hooks/useDentists'
import { useUnits } from '@/hooks/useUnits'
import { useProcedures } from '@/hooks/useProcedures'
import { useScheduleBlocks } from '@/hooks/useScheduleBlocks'

type View = 'day' | 'week' | 'list'

// Só aceitamos UUIDs vindos da URL — um valor inválido quebraria a validação
// Zod do endpoint de appointments (400) e travaria a agenda inteira.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

// Column header for dentist names in daily view
function DailyHeader({
  dentists,
  selectedDentistId,
  appointments,
}: {
  dentists: ReturnType<typeof useDentists>['dentists']
  selectedDentistId: string | null
  appointments: Appointment[]
}) {
  const visible = selectedDentistId ? dentists.filter(d => d.id === selectedDentistId) : dentists
  return (
    <div className="flex border-b border-gray-100 bg-white flex-shrink-0" style={{ minWidth: `${visible.length * 160 + 56}px` }}>
      <div className="w-14 flex-shrink-0 border-r border-gray-100" />
      {visible.map(d => {
        const name = d.user?.name ?? '—'
        const count = appointments.filter(a => a.dentist?.id === d.id).length
        return (
          <div key={d.id} className="flex-1 min-w-40 py-3 px-3 border-r border-gray-100 last:border-0">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                style={{ background: d.color ?? 'linear-gradient(135deg,#a855f7,#d946ef)' }}
              >
                {getInitials(name)}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-gray-800 truncate leading-tight">{name}</div>
                <div className="text-[11px] text-gray-400">{count} agend.</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AgendaShell() {
  const [view, setView]             = useState<View>('day')
  const [date, setDate]             = useState(new Date())
  const [selectedDentistId, setSelectedDentistId] = useState<string | null>(null)
  const [popover, setPopover]           = useState<{ appt: Appointment; el: HTMLElement | null } | null>(null)
  const [modalOpen, setModalOpen]       = useState(false)
  const [modalInitial, setModalInitial] = useState<{ dentistId?: string; date?: string; time?: string }>({})
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null)
  const [listPage, setListPage]         = useState(1)
  const [listStatus, setListStatus]     = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch]             = useState('')
  const [focusRequest, setFocusRequest] = useState<{ apptId: string; minutes: number; token: number } | null>(null)

  const { dentists, loading: loadingDentists } = useDentists()
  const { units } = useUnits()
  const { procedures } = useProcedures()

  // Filtros de unidade/procedimento (TASK-033): nascem da querystring — assim
  // sobrevivem à troca de dia E à recarga da página — e voltam para ela a cada
  // mudança via history.replaceState (sem re-navegar, o Next sincroniza).
  const searchParams = useSearchParams()
  const [unitFilter, setUnitFilter] = useState<string | null>(() => {
    const v = searchParams?.get('unidade')
    return v && UUID_RE.test(v) ? v : null
  })
  const [procedureFilter, setProcedureFilter] = useState<string | null>(() => {
    const v = searchParams?.get('procedimento')
    return v && UUID_RE.test(v) ? v : null
  })

  const setUrlParam = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(window.location.search)
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [])

  const handleUnitFilter = useCallback((id: string | null) => {
    setUnitFilter(id)
    setUrlParam('unidade', id)
    // Dentista selecionado que não atende na nova unidade sai da seleção.
    if (id) {
      setSelectedDentistId(prev => {
        if (!prev) return prev
        const d = dentists.find(x => x.id === prev)
        return d?.units?.some(u => u.unit_id === id) ? prev : null
      })
    }
  }, [dentists, setUrlParam])

  const handleProcedureFilter = useCallback((id: string | null) => {
    setProcedureFilter(id)
    setUrlParam('procedimento', id)
  }, [setUrlParam])

  // Unidade filtrada esconde os dentistas que não atendem nela — vale para a
  // sidebar, as colunas do dia e os bloqueios (não só para as consultas).
  const visibleDentists = useMemo(
    () => unitFilter ? dentists.filter(d => d.units?.some(u => u.unit_id === unitFilter)) : dentists,
    [dentists, unitFilter]
  )

  // Chips dos filtros ativos: o nome vem das listas carregadas; enquanto elas
  // não chegam (ou se o id da URL não existir mais), o chip fica de fora — o
  // filtro segue aplicado na consulta mesmo assim.
  const activeChips = useMemo(() => {
    const chips: FilterChip[] = []
    const unit = unitFilter ? units.find(u => u.id === unitFilter) : null
    if (unit) chips.push({ key: 'unit', label: unit.name, onRemove: () => handleUnitFilter(null) })
    const proc = procedureFilter ? procedures.find(p => p.id === procedureFilter) : null
    if (proc) chips.push({ key: 'procedure', label: proc.name, onRemove: () => handleProcedureFilter(null) })
    return chips
  }, [unitFilter, procedureFilter, units, procedures, handleUnitFilter, handleProcedureFilter])

  const dateStr = format(date, 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd   = format(endOfWeek(date,   { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const sharedFilters = {
    unit_id:      unitFilter ?? undefined,
    procedure_id: procedureFilter ?? undefined,
  }

  const filters = view === 'day'
    ? { ...sharedFilters, date: dateStr, dentist_id: selectedDentistId ?? undefined, status: statusFilter || 'all' }
    : view === 'week'
    ? { ...sharedFilters, date_from: weekStart, date_to: weekEnd, dentist_id: selectedDentistId ?? undefined, page_size: 200, status: statusFilter || 'all' }
    : { ...sharedFilters, page: listPage, page_size: 50, status: listStatus || 'all' }

  const { appointments, total, loading, updateStatus, create, refetch } = useAppointments(filters)

  // Bloqueios (almoço/ausência/reunião/reservado) + expediente dos dentistas.
  // Dia: busca só o dia exibido; Semana/Lista: a semana corrente.
  const blocksFrom = view === 'day' ? dateStr : weekStart
  const blocksTo   = view === 'day' ? dateStr : weekEnd
  const { blocks, schedules } = useScheduleBlocks(blocksFrom, blocksTo)

  // Os filtros de dentista e de unidade da sidebar também valem para os bloqueios.
  const visibleBlocks = useMemo(() => {
    const unitIds = new Set(visibleDentists.map(d => d.id))
    return blocks.filter(b =>
      (selectedDentistId ? b.dentist_id === selectedDentistId : true) &&
      (unitFilter ? unitIds.has(b.dentist_id) : true)
    )
  }, [blocks, selectedDentistId, unitFilter, visibleDentists])

  // Carregando enquanto dentistas OU agendamentos ainda não chegaram.
  const isLoading = loading || loadingDentists

  // Busca GLOBAL (todos os dias): consulta o backend de forma debounced a partir
  // de 2 caracteres. Desacoplada da grade — a grade segue mostrando o dia inteiro.
  const [searchResults, setSearchResults] = useState<Appointment[]>([])
  useEffect(() => {
    const q = search.trim()
    let cancelled = false
    // O clear/fetch roda dentro do timeout (assíncrono) — nunca setState síncrono
    // no corpo do effect. Com q < 2 caracteres limpamos imediatamente (delay 0).
    const t = setTimeout(async () => {
      if (q.length < 2) { if (!cancelled) setSearchResults([]); return }
      try {
        const res = await api.get<{ data: Appointment[] }>(`/api/appointments?q=${encodeURIComponent(q)}&page_size=30`)
        if (!cancelled) setSearchResults(res.data ?? [])
      } catch {
        if (!cancelled) setSearchResults([])
      }
    }, q.length < 2 ? 0 : 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search])

  const handleAppointmentClick = useCallback((appt: Appointment, el: HTMLElement | null) => {
    setPopover({ appt, el })
  }, [])

  const handleSlotClick = useCallback((dentistId: string, startIso: string) => {
    const [d, t] = startIso.split('T')
    setModalInitial({ dentistId, date: d, time: t })
    setModalOpen(true)
  }, [])

  const handleDayClick = useCallback((dayStr: string) => {
    setDate(new Date(dayStr + 'T12:00:00'))
    setView('day')
  }, [])

  const handleAppointmentSelect = useCallback((appt: Appointment) => {
    // Vai para o DIA do agendamento (data e hora no fuso local) e dispara um
    // "pedido de foco" one-shot, que a DailyView usa para rolar suave até o
    // horário e destacar o bloco. O token incremental garante que o foco
    // re-dispare mesmo para o mesmo horário. O popover não abre sozinho — a
    // busca leva e destaca; o clique no bloco mostra os detalhes.
    const start = new Date(appt.start_at)
    const minutes = start.getHours() * 60 + start.getMinutes()
    setDate(new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0))
    setView('day')
    setFocusRequest(prev => ({ apptId: appt.id, minutes, token: (prev?.token ?? 0) + 1 }))
  }, [])

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {/* Sidebar (esquerda) */}
      <AgendaSidebar
        selectedDate={date}
        onDateSelect={d => { setDate(d); setView('day') }}
        dentists={visibleDentists}
        selectedDentistId={selectedDentistId}
        onDentistChange={setSelectedDentistId}
        appointments={appointments}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        units={units}
        procedures={procedures}
        unitFilter={unitFilter}
        procedureFilter={procedureFilter}
        onUnitFilter={handleUnitFilter}
        onProcedureFilter={handleProcedureFilter}
      />

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <AgendaHeader
          date={date}
          view={view}
          totalToday={appointments.length}
          onDateChange={setDate}
          onViewChange={v => { setView(v); setListPage(1) }}
          onNewAppointment={() => { setModalInitial({}); setModalOpen(true) }}
          onSearch={setSearch}
          searchResults={searchResults}
          onAppointmentSelect={handleAppointmentSelect}
        />

        <div className="relative flex flex-col flex-1 overflow-hidden">
        <KPIStrip appointments={appointments} statusFilter={statusFilter} onStatusFilter={setStatusFilter} />

        {/* Chips dos filtros ativos de unidade/procedimento (TASK-033) */}
        <FilterChips chips={activeChips} />

        {/* Daily column headers */}
        {view === 'day' && !loadingDentists && (
          <div className="overflow-x-auto flex-shrink-0 bg-white shadow-sm">
            <DailyHeader dentists={visibleDentists} selectedDentistId={selectedDentistId} appointments={appointments} />
          </div>
        )}

        {/* View content */}
        {view === 'day' && (
          <div className="flex-1 overflow-x-auto">
            <DailyView
              appointments={appointments}
              dentists={visibleDentists}
              selectedDentistId={selectedDentistId}
              date={dateStr}
              onAppointmentClick={handleAppointmentClick}
              onSlotClick={handleSlotClick}
              focusRequest={focusRequest}
              blocks={visibleBlocks}
              schedules={schedules}
            />
          </div>
        )}

        {view === 'week' && (
          <WeeklyView
            appointments={appointments}
            date={dateStr}
            onAppointmentClick={handleAppointmentClick}
            onDayClick={handleDayClick}
            blocks={visibleBlocks}
            dentists={visibleDentists}
          />
        )}

        {view === 'list' && (
          <ListView
            appointments={appointments}
            loading={loading}
            total={total}
            page={listPage}
            pageSize={50}
            onPageChange={p => { setListPage(p) }}
            onAppointmentClick={handleAppointmentClick}
            statusFilter={listStatus}
            onStatusFilter={s => { setListStatus(s); setListPage(1) }}
          />
        )}

          {/* Overlay de carregamento da agenda */}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Carregando agenda...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Appointment popover */}
      {popover && (
        <AppointmentPopover
          appointment={popover.appt}
          anchorEl={popover.el}
          onClose={() => setPopover(null)}
          onStatusChange={(id, status) => updateStatus(id, status)}
          onReschedule={appt => {
            setRescheduleAppt(appt)
            setPopover(null)
          }}
        />
      )}

      {/* Reschedule modal */}
      <RescheduleModal
        open={rescheduleAppt !== null}
        appointment={rescheduleAppt}
        dentists={dentists}
        onClose={() => setRescheduleAppt(null)}
        onSaved={() => { setRescheduleAppt(null); refetch() }}
      />

      {/* New appointment modal */}
      <NewAppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={async (payload) => { await create(payload) }}
        dentists={dentists}
        initialDentistId={modalInitial.dentistId}
        initialDate={modalInitial.date}
        initialTime={modalInitial.time}
      />
    </div>
  )
}
