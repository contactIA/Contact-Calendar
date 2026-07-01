'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAnimatedMount } from '@/hooks/useAnimatedMount'
import { format, addMinutes, parse, parseISO } from 'date-fns'
import { api } from '@/lib/client'
import { type Dentist } from '@/hooks/useDentists'
import { SlotPicker } from './SlotPicker'
import { type Slot } from '@/hooks/useSlots'

type Patient   = { id: string; name: string; phone: string | null }
type Procedure = { id: string; name: string; duration_minutes: number; color: string }
type Unit      = { id: string; name: string }
type Chair     = { id: string; name: string; unit_id: string }

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (payload: {
    patient_id: string
    dentist_id: string
    unit_id: string
    chair_id: string
    procedure_id: string
    start_at: string
    duration_minutes: number
  }) => Promise<void>
  dentists: Dentist[]
  initialDentistId?: string
  initialDate?: string
  initialTime?: string
}

export function NewAppointmentModal({ open, onClose, onConfirm, dentists, initialDentistId, initialDate, initialTime }: Props) {
  const { mounted, closing } = useAnimatedMount(open, 180)
  const [step, setStep] = useState<'patient' | 'details' | 'time'>('patient')

  // Patient search
  const [patientQuery, setPatientQuery]   = useState('')
  const [patients, setPatients]           = useState<Patient[]>([])
  const [searchDone, setSearchDone]       = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  // Inline new patient
  const [creating, setCreating]           = useState(false)
  const [newName, setNewName]             = useState('')
  const [newPhone, setNewPhone]           = useState('')
  const [newEmail, setNewEmail]           = useState('')
  const [newBirth, setNewBirth]           = useState('')
  const [savingPatient, setSavingPatient] = useState(false)
  const [patientError, setPatientError]   = useState<string | null>(null)

  // Step 2 — details
  const [procedures, setProcedures]           = useState<Procedure[]>([])
  const [units, setUnits]                     = useState<Unit[]>([])
  const [chairs, setChairs]                   = useState<Chair[]>([])
  const [selectedDentistId, setSelectedDentistId]   = useState(initialDentistId ?? '')
  const [selectedProcedureId, setSelectedProcedureId] = useState('')
  const [selectedUnitId, setSelectedUnitId]   = useState('')
  const [selectedChairId, setSelectedChairId] = useState('')
  const [selectedDate, setSelectedDate]       = useState(initialDate ?? format(new Date(), 'yyyy-MM-dd'))

  // Step 3 — time
  const [startTime, setStartTime]         = useState(initialTime?.slice(0, 5) ?? '08:00')
  const [durationMin, setDurationMin]     = useState(30)
  const [selectedSlot, setSelectedSlot]   = useState<Slot | null>(null)

  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Chairs filtered by selected unit
  const unitChairs = useMemo(
    () => chairs.filter(c => !selectedUnitId || c.unit_id === selectedUnitId),
    [chairs, selectedUnitId]
  )

  // Auto-select first chair when unit changes
  useEffect(() => {
    setSelectedChairId(unitChairs[0]?.id ?? '')
  }, [selectedUnitId, chairs])

  // Auto-fill duration from procedure
  useEffect(() => {
    const proc = procedures.find(p => p.id === selectedProcedureId)
    if (proc) setDurationMin(proc.duration_minutes)
  }, [selectedProcedureId, procedures])

  // Computed end time label
  const endTimeLabel = useMemo(() => {
    try {
      const base = parse(`${selectedDate} ${startTime}`, 'yyyy-MM-dd HH:mm', new Date())
      return format(addMinutes(base, durationMin), 'HH:mm')
    } catch { return '—' }
  }, [selectedDate, startTime, durationMin])

  useEffect(() => {
    if (!open) return
    api.get<Procedure[]>('/api/procedures').then(setProcedures).catch(() => {})
    api.get<Unit[]>('/api/units').then(setUnits).catch(() => {})
    api.get<Chair[]>('/api/admin/chairs').then(setChairs).catch(() => {})
  }, [open])

  // Ao abrir, semeia dentista/data/horário a partir do slot clicado.
  // O modal fica sempre montado, então os inicializadores de useState rodam só
  // uma vez (com props undefined) — sem isto, o slot clicado não chega à etapa
  // de horário e o campo "reinicia" no default.
  useEffect(() => {
    if (!open) return
    setStep('patient')
    setSelectedDentistId(initialDentistId ?? '')
    setSelectedDate(initialDate ?? format(new Date(), 'yyyy-MM-dd'))
    setStartTime(initialTime?.slice(0, 5) ?? '08:00')
  }, [open, initialDentistId, initialDate, initialTime])

  useEffect(() => {
    if (patientQuery.length < 3) { setPatients([]); setSearchDone(false); return }
    const t = setTimeout(() => {
      api.get<{ data: Patient[] }>(`/api/patients?q=${encodeURIComponent(patientQuery)}`)
        .then(r => { setPatients(r.data ?? []); setSearchDone(true) })
        .catch(() => { setPatients([]); setSearchDone(true) })
    }, 300)
    return () => clearTimeout(t)
  }, [patientQuery])

  // Limpa slot selecionado ao mudar data (os horários livres mudam)
  useEffect(() => {
    setSelectedSlot(null)
    setSelectedChairId('')
  }, [selectedDate])

  function reset() {
    setStep('patient'); setPatientQuery(''); setPatients([]); setSearchDone(false)
    setSelectedPatient(null); setCreating(false)
    setNewName(''); setNewPhone(''); setNewEmail(''); setNewBirth('')
    setPatientError(null); setSavingPatient(false)
    setSelectedDentistId(initialDentistId ?? '')
    setSelectedProcedureId(''); setSelectedUnitId(''); setSelectedChairId('')
    setSelectedDate(initialDate ?? format(new Date(), 'yyyy-MM-dd'))
    setStartTime(initialTime?.slice(0, 5) ?? '08:00')
    setDurationMin(30); setSelectedSlot(null)
    setError(null); setSaving(false)
  }

  function handleSlotSelect(slot: Slot) {
    setSelectedSlot(slot)
    setStartTime(format(parseISO(slot.start_at), 'HH:mm'))
    setSelectedChairId(slot.chair_id)
  }

  async function handleCreatePatient() {
    if (!newName.trim()) { setPatientError('Nome é obrigatório'); return }
    setSavingPatient(true); setPatientError(null)
    try {
      const created = await api.post<Patient>('/api/patients', {
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        email: newEmail.trim() || undefined,
        birth_date: newBirth || undefined,
      })
      setSelectedPatient(created); setStep('details'); setCreating(false)
    } catch (e: unknown) {
      setPatientError(e instanceof Error ? e.message : 'Erro ao cadastrar')
    } finally {
      setSavingPatient(false)
    }
  }

  async function handleConfirm() {
    if (!selectedPatient || !selectedDentistId || !selectedUnitId || !selectedChairId || !selectedProcedureId) return
    setSaving(true); setError(null)
    try {
      const start_at = new Date(`${selectedDate}T${startTime}:00`).toISOString()
      await onConfirm({
        patient_id:       selectedPatient.id,
        dentist_id:       selectedDentistId,
        unit_id:          selectedUnitId,
        chair_id:         selectedChairId,
        procedure_id:     selectedProcedureId,
        start_at,
        duration_minutes: durationMin,
      })
      reset(); onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao agendar')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) return null

  const stepIndex = { patient: 0, details: 1, time: 2 }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden ${closing ? 'animate-modal-out' : 'animate-modal-in'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Novo Agendamento</h2>
          <button onClick={() => { reset(); onClose() }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Steps */}
        <div className="flex px-6 pt-4 gap-2">
          {(['patient', 'details', 'time'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                step === s
                  ? 'bg-gradient-to-r from-violet-600 to-rose-600 text-white'
                  : i < stepIndex[step]
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
              }`}>{i + 1}</div>
              <span className="text-xs text-gray-500 hidden sm:block">
                {s === 'patient' ? 'Paciente' : s === 'details' ? 'Detalhes' : 'Horário'}
              </span>
              {i < 2 && <div className="flex-1 h-px bg-gray-100" />}
            </div>
          ))}
        </div>

        <div className="px-6 py-4">

          {/* Step 1a — busca */}
          {step === 'patient' && !creating && (
            <div className="space-y-3">
              <Field label="Buscar paciente">
                <input
                  autoFocus
                  value={patientQuery}
                  onChange={e => { setPatientQuery(e.target.value); setSearchDone(false) }}
                  placeholder="Nome ou telefone (mín. 3 caracteres)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </Field>
              {patients.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-50 max-h-48 overflow-y-auto">
                  {patients.map(p => (
                    <button key={p.id} onClick={() => { setSelectedPatient(p); setStep('details') }}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors">
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                    </button>
                  ))}
                </div>
              )}
              {searchDone && patients.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-4 text-center space-y-2">
                  <p className="text-sm text-gray-500">Nenhum resultado para <strong>"{patientQuery}"</strong></p>
                  <button onClick={() => { setNewName(patientQuery); setCreating(true) }}
                    className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors">
                    + Cadastrar novo paciente
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 1b — cadastro inline */}
          {step === 'patient' && creating && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setCreating(false)} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
                <p className="text-sm font-semibold text-gray-700">Novo paciente</p>
              </div>
              <Field label="Nome *">
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              </Field>
              <Field label="Telefone / WhatsApp">
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="E-mail">
                  <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    placeholder="opcional"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </Field>
                <Field label="Nascimento">
                  <input type="date" value={newBirth} onChange={e => setNewBirth(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </Field>
              </div>
              {patientError && <p className="text-xs text-red-600">{patientError}</p>}
            </div>
          )}

          {/* Step 2 — detalhes */}
          {step === 'details' && selectedPatient && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-violet-50 rounded-lg px-3 py-2">
                <span className="text-violet-500 text-sm">👤</span>
                <span className="text-sm font-medium text-violet-800">{selectedPatient.name}</span>
                {selectedPatient.phone && <span className="text-xs text-violet-400 ml-auto">{selectedPatient.phone}</span>}
              </div>
              <Field label="Dentista">
                <select value={selectedDentistId} onChange={e => setSelectedDentistId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="">Selecionar...</option>
                  {dentists.map(d => <option key={d.id} value={d.id}>{d.user?.name}</option>)}
                </select>
              </Field>
              <Field label="Unidade">
                <select value={selectedUnitId} onChange={e => setSelectedUnitId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="">Selecionar...</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Procedimento">
                <select value={selectedProcedureId} onChange={e => setSelectedProcedureId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="">Selecionar...</option>
                  {procedures.map(p => <option key={p.id} value={p.id}>{p.name} ({p.duration_minutes}min)</option>)}
                </select>
              </Field>
            </div>
          )}

          {/* Step 3 — horário */}
          {step === 'time' && (
            <div className="space-y-3">
              <Field label="Data">
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
              </Field>

              <Field label="Horários disponíveis">
                <SlotPicker
                  dentistId={selectedDentistId}
                  unitId={selectedUnitId}
                  procedureId={selectedProcedureId}
                  date={selectedDate}
                  selected={selectedSlot}
                  onSelect={handleSlotSelect}
                />
              </Field>

              {/* Resumo visual — só aparece após selecionar */}
              {selectedSlot && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Início</p>
                    <p className="text-xl font-bold text-gray-800">{startTime}</p>
                  </div>
                  <div className="flex-1 mx-3 flex flex-col items-center">
                    <div className="h-px w-full bg-gray-300 relative">
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 whitespace-nowrap">
                        {durationMin} min
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Fim</p>
                    <p className="text-xl font-bold text-gray-800">{endTimeLabel}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="px-6 pb-2 text-xs text-red-600">{error}</p>}

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-5">
          {(step !== 'patient' || creating) && !savingPatient && (
            <button
              onClick={() => {
                if (creating) { setCreating(false); return }
                setStep(step === 'time' ? 'details' : 'patient')
              }}
              className="flex-1 border border-violet-200 text-violet-600 py-2.5 rounded-xl text-sm font-medium hover:bg-violet-50 transition-colors">
              Voltar
            </button>
          )}

          {step === 'patient' && creating && (
            <button disabled={!newName.trim() || savingPatient} onClick={handleCreatePatient}
              className="flex-1 bg-gradient-to-r from-violet-600 to-rose-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-colors">
              {savingPatient ? 'Salvando...' : 'Salvar e continuar'}
            </button>
          )}

          {step === 'details' && (
            <button
              disabled={!selectedDentistId || !selectedUnitId || !selectedProcedureId}
              onClick={() => setStep('time')}
              className="flex-1 bg-gradient-to-r from-violet-600 to-rose-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-colors">
              Ver horários livres
            </button>
          )}

          {step === 'time' && (
            <button disabled={saving || !selectedSlot} onClick={handleConfirm}
              className="flex-1 bg-gradient-to-r from-violet-600 to-rose-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-colors">
              {saving ? 'Agendando...' : 'Confirmar agendamento'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      {children}
    </div>
  )
}
