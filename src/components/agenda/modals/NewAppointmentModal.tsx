'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { api } from '@/lib/client'
import { type Dentist } from '@/hooks/useDentists'
import { useSlots } from '@/hooks/useSlots'

type Patient = { id: string; name: string; phone: string | null }
type Procedure = { id: string; name: string; duration_minutes: number; color: string }
type Unit = { id: string; name: string }

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
  const [step, setStep] = useState<'patient' | 'details' | 'slot'>('patient')
  const [patientQuery, setPatientQuery] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [selectedDentistId, setSelectedDentistId] = useState(initialDentistId ?? '')
  const [selectedProcedureId, setSelectedProcedureId] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [selectedDate, setSelectedDate] = useState(initialDate ?? format(new Date(), 'yyyy-MM-dd'))
  const [selectedSlot, setSelectedSlot] = useState<{ start_at: string; end_at: string; chair_id: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { slots, loading: loadingSlots } = useSlots(
    selectedDentistId && selectedUnitId && selectedProcedureId && step === 'slot'
      ? { dentist_id: selectedDentistId, unit_id: selectedUnitId, procedure_id: selectedProcedureId, date: selectedDate }
      : null
  )

  // Load procedures and units
  useEffect(() => {
    if (!open) return
    api.get<Procedure[]>('/api/admin/procedures').then(setProcedures).catch(() => {})
    api.get<Unit[]>('/api/admin/units').then(setUnits).catch(() => {})
  }, [open])

  // Search patients
  useEffect(() => {
    if (patientQuery.length < 3) { setPatients([]); return }
    const t = setTimeout(() => {
      api.get<{ data: Patient[] }>(`/api/patients?q=${encodeURIComponent(patientQuery)}`)
        .then(r => setPatients(r.data))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [patientQuery])

  function reset() {
    setStep('patient'); setPatientQuery(''); setPatients([])
    setSelectedPatient(null); setSelectedDentistId(initialDentistId ?? '')
    setSelectedProcedureId(''); setSelectedUnitId(''); setSelectedSlot(null)
    setError(null); setSaving(false)
  }

  async function handleConfirm() {
    if (!selectedPatient || !selectedSlot || !selectedProcedureId || !selectedUnitId) return
    const proc = procedures.find(p => p.id === selectedProcedureId)
    if (!proc) return
    setSaving(true)
    try {
      await onConfirm({
        patient_id: selectedPatient.id,
        dentist_id: selectedDentistId,
        unit_id: selectedUnitId,
        chair_id: selectedSlot.chair_id,
        procedure_id: selectedProcedureId,
        start_at: selectedSlot.start_at,
        duration_minutes: proc.duration_minutes,
      })
      reset()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao agendar')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Novo Agendamento</h2>
          <button onClick={() => { reset(); onClose() }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Steps indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {(['patient', 'details', 'slot'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                step === s ? 'bg-green-600 text-white' :
                (['details', 'slot'].indexOf(s) < ['details', 'slot'].indexOf(step)) ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-400'
              }`}>{i + 1}</div>
              <span className="text-xs text-gray-500 hidden sm:block">
                {s === 'patient' ? 'Paciente' : s === 'details' ? 'Detalhes' : 'Horário'}
              </span>
              {i < 2 && <div className="flex-1 h-px bg-gray-100" />}
            </div>
          ))}
        </div>

        <div className="px-6 py-4">
          {/* Step 1: patient */}
          {step === 'patient' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Buscar paciente</label>
                <input
                  autoFocus
                  value={patientQuery}
                  onChange={e => setPatientQuery(e.target.value)}
                  placeholder="Nome ou telefone (mín. 3 caracteres)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              {patients.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-50 max-h-48 overflow-y-auto">
                  {patients.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPatient(p); setStep('details') }}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      {p.phone && <p className="text-xs text-gray-400">{p.phone}</p>}
                    </button>
                  ))}
                </div>
              )}
              {patientQuery.length >= 3 && patients.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">Nenhum paciente encontrado</p>
              )}
            </div>
          )}

          {/* Step 2: details */}
          {step === 'details' && selectedPatient && (
            <div className="space-y-3">
              <div className="bg-green-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-green-700 font-medium">{selectedPatient.name}</span>
              </div>
              <Field label="Dentista">
                <select value={selectedDentistId} onChange={e => setSelectedDentistId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">Selecionar...</option>
                  {dentists.map(d => <option key={d.id} value={d.id}>{d.user?.name}</option>)}
                </select>
              </Field>
              <Field label="Unidade">
                <select value={selectedUnitId} onChange={e => setSelectedUnitId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">Selecionar...</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Procedimento">
                <select value={selectedProcedureId} onChange={e => setSelectedProcedureId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="">Selecionar...</option>
                  {procedures.map(p => <option key={p.id} value={p.id}>{p.name} ({p.duration_minutes}min)</option>)}
                </select>
              </Field>
              <Field label="Data">
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </Field>
            </div>
          )}

          {/* Step 3: slot */}
          {step === 'slot' && (
            <div>
              <p className="text-xs text-gray-500 mb-3">Horários disponíveis em {format(new Date(selectedDate + 'T12:00:00'), 'dd/MM/yyyy')}</p>
              {loadingSlots && <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>}
              {!loadingSlots && slots.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum horário disponível nessa data</p>
              )}
              <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                {slots.map(slot => (
                  <button
                    key={slot.start_at}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                      selectedSlot?.start_at === slot.start_at
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:text-green-700'
                    }`}
                  >
                    {format(new Date(slot.start_at), 'HH:mm')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="px-6 pb-2 text-xs text-red-600">{error}</p>}

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-5">
          {step !== 'patient' && (
            <button onClick={() => setStep(step === 'slot' ? 'details' : 'patient')}
              className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Voltar
            </button>
          )}
          {step === 'details' && (
            <button
              disabled={!selectedDentistId || !selectedUnitId || !selectedProcedureId}
              onClick={() => setStep('slot')}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
              Ver horários
            </button>
          )}
          {step === 'slot' && (
            <button
              disabled={!selectedSlot || saving}
              onClick={handleConfirm}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
              {saving ? 'Agendando...' : 'Confirmar'}
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
