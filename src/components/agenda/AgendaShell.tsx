'use client'

import { useState, useCallback, useMemo } from 'react'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { AgendaHeader } from './AgendaHeader'
import { AgendaSidebar } from './AgendaSidebar'
import { KPIStrip } from './KPIStrip'
import { DailyView } from './views/DailyView'
import { WeeklyView } from './views/WeeklyView'
import { ListView } from './views/ListView'
import { AppointmentPopover } from './AppointmentPopover'
import { NewAppointmentModal } from './modals/NewAppointmentModal'
import { RescheduleModal } from './modals/RescheduleModal'
import { useAppointments, type Appointment } from '@/hooks/useAppointments'
import { useDentists } from '@/hooks/useDentists'

type View = 'day' | 'week' | 'list'

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
  const [search, setSearch]             = useState('')

  const { dentists, loading: loadingDentists } = useDentists()

  const dateStr = format(date, 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd   = format(endOfWeek(date,   { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const filters = view === 'day'
    ? { date: dateStr, dentist_id: selectedDentistId ?? undefined }
    : view === 'week'
    ? { date_from: weekStart, date_to: weekEnd, dentist_id: selectedDentistId ?? undefined, page_size: 200 }
    : { page: listPage, page_size: 50 }

  const { appointments, total, loading, updateStatus, create, refetch } = useAppointments(filters)

  // For week view, appointments already filtered server-side; just alias
  const weekAppointments = appointments

  // Apply search filter
  const filteredAppointments = useMemo(() => {
    if (!search.trim()) return appointments
    const q = search.toLowerCase()
    return appointments.filter(a =>
      a.patient?.name?.toLowerCase().includes(q) ||
      a.procedure?.name?.toLowerCase().includes(q) ||
      a.dentist?.user?.name?.toLowerCase().includes(q)
    )
  }, [appointments, search])

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

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
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
        />

        <KPIStrip appointments={appointments} />

        {/* Daily column headers */}
        {view === 'day' && !loadingDentists && (
          <div className="overflow-x-auto flex-shrink-0 bg-white shadow-sm">
            <DailyHeader dentists={dentists} selectedDentistId={selectedDentistId} appointments={appointments} />
          </div>
        )}

        {/* View content */}
        {view === 'day' && (
          <div className="flex-1 overflow-x-auto">
            <DailyView
              appointments={filteredAppointments}
              dentists={dentists}
              selectedDentistId={selectedDentistId}
              date={dateStr}
              onAppointmentClick={handleAppointmentClick}
              onSlotClick={handleSlotClick}
            />
          </div>
        )}

        {view === 'week' && (
          <WeeklyView
            appointments={weekAppointments}
            date={dateStr}
            onAppointmentClick={handleAppointmentClick}
            onDayClick={handleDayClick}
          />
        )}

        {view === 'list' && (
          <ListView
            appointments={appointments}
            loading={loading}
            total={total}
            page={listPage}
            pageSize={50}
            onPageChange={setListPage}
            onAppointmentClick={handleAppointmentClick}
          />
        )}
      </div>

      {/* Sidebar */}
      <AgendaSidebar
        selectedDate={date}
        onDateSelect={d => { setDate(d); setView('day') }}
        dentists={dentists}
        selectedDentistId={selectedDentistId}
        onDentistChange={setSelectedDentistId}
        appointments={appointments}
      />

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
