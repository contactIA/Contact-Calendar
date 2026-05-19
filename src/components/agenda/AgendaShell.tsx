'use client'

import { useState, useCallback } from 'react'
import { format, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns'
import { AgendaHeader } from './AgendaHeader'
import { AgendaSidebar } from './AgendaSidebar'
import { DailyView } from './views/DailyView'
import { WeeklyView } from './views/WeeklyView'
import { ListView } from './views/ListView'
import { AppointmentPopover } from './AppointmentPopover'
import { NewAppointmentModal } from './modals/NewAppointmentModal'
import { useAppointments, type Appointment } from '@/hooks/useAppointments'
import { useDentists } from '@/hooks/useDentists'

type View = 'day' | 'week' | 'list'

// Column header for dentist names in daily view
function DailyHeader({ dentists, selectedDentistId }: { dentists: ReturnType<typeof useDentists>['dentists'], selectedDentistId: string | null }) {
  const visible = selectedDentistId ? dentists.filter(d => d.id === selectedDentistId) : dentists
  return (
    <div className="flex border-b border-gray-200 bg-white flex-shrink-0" style={{ minWidth: `${visible.length * 160 + 56}px` }}>
      <div className="w-14 flex-shrink-0 border-r border-gray-100" />
      {visible.map(d => (
        <div key={d.id} className="flex-1 min-w-40 py-3 text-center border-r border-gray-100 last:border-0">
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-xs font-semibold text-gray-700 leading-tight">{d.user?.name ?? '—'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function AgendaShell() {
  const [view, setView]             = useState<View>('day')
  const [date, setDate]             = useState(new Date())
  const [selectedDentistId, setSelectedDentistId] = useState<string | null>(null)
  const [popover, setPopover]       = useState<{ appt: Appointment; el: HTMLElement | null } | null>(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [modalInitial, setModalInitial] = useState<{ dentistId?: string; date?: string; time?: string }>({})
  const [listPage, setListPage]     = useState(1)

  const { dentists, loading: loadingDentists } = useDentists()

  const dateStr = format(date, 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd   = format(endOfWeek(date,   { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const filters = view === 'day'
    ? { date: dateStr, dentist_id: selectedDentistId ?? undefined }
    : view === 'week'
    ? { date: weekStart }  // list view fetches a week range using date filter below
    : { page: listPage, page_size: 50 }

  // For weekly view we need a wider date range
  const weekFilters = view === 'week'
    ? { dentist_id: selectedDentistId ?? undefined }
    : undefined

  const { appointments, total, loading, updateStatus, create } = useAppointments(
    view === 'week' ? { ...weekFilters } : filters
  )

  // Filter week appointments client-side
  const weekAppointments = view === 'week'
    ? appointments.filter(a => a.start_at >= weekStart && a.start_at <= weekEnd + 'T23:59:59')
    : appointments

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
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <AgendaHeader
          date={date}
          view={view}
          onDateChange={setDate}
          onViewChange={v => { setView(v); setListPage(1) }}
          onNewAppointment={() => { setModalInitial({}); setModalOpen(true) }}
        />

        {/* Daily column headers */}
        {view === 'day' && !loadingDentists && (
          <div className="overflow-x-auto flex-shrink-0 border-b border-gray-200 bg-white">
            <DailyHeader dentists={dentists} selectedDentistId={selectedDentistId} />
          </div>
        )}

        {/* View content */}
        {view === 'day' && (
          <div className="flex-1 overflow-x-auto">
            <DailyView
              appointments={appointments}
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
      />

      {/* Appointment popover */}
      {popover && (
        <AppointmentPopover
          appointment={popover.appt}
          anchorEl={popover.el}
          onClose={() => setPopover(null)}
          onStatusChange={(id, status) => updateStatus(id, status)}
          onReschedule={appt => {
            setModalInitial({ dentistId: appt.dentist?.id, date: format(new Date(appt.start_at), 'yyyy-MM-dd') })
            setModalOpen(true)
            setPopover(null)
          }}
        />
      )}

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
