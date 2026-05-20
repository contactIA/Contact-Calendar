'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/client'

// ─── Types ─────────────────────────────────────────────────────────────────

type Unit = {
  id: string; name: string; address?: string | null; phone?: string | null; is_active: boolean
}
type Chair = {
  id: string; name: string; is_active: boolean; unit_id: string
  unit?: { id: string; name: string } | null
}
type Procedure = {
  id: string; name: string; duration_minutes: number; color?: string | null
  required_specialty?: string | null; is_active: boolean
}
type Dentist = {
  id: string; cro?: string | null; specialty: string[]; color: string
  user?: { id: string; name: string; email?: string | null; external_id: string } | null
}
type Schedule = {
  id: string; day_of_week: number; start_time: string; end_time: string
  unit_id: string; unit?: { id: string; name: string } | null
}
type ApiKey = {
  id: string; label: string; is_active: boolean
  last_used_at: string | null; created_at: string
}

type Tab = 'unidades' | 'cadeiras' | 'procedimentos' | 'profissionais' | 'api-keys'

// ─── Shared helpers ─────────────────────────────────────────────────────────

function SectionHeader({ title, onAdd }: { title: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {onAdd && (
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 transition-opacity"
        >
          + Adicionar
        </button>
      )}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-sm">{label}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-violet-600' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
    </button>
  )
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"

// ─── Units tab ───────────────────────────────────────────────────────────────

function UnitsTab() {
  const [items, setItems]   = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState<{ open: boolean; item: Unit | null }>({ open: false, item: null })
  const [name, setName]     = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await api.get<Unit[]>('/api/admin/units')) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openModal(item: Unit | null) {
    setModal({ open: true, item })
    setName(item?.name ?? '')
    setAddress(item?.address ?? '')
    setPhone(item?.phone ?? '')
    setError('')
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError('')
    try {
      const payload = { name: name.trim(), address: address || undefined, phone: phone || undefined }
      if (modal.item) {
        await api.patch(`/api/admin/units/${modal.item.id}`, payload)
      } else {
        await api.post('/api/admin/units', payload)
      }
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: Unit) {
    try { await api.patch(`/api/admin/units/${item.id}`, { is_active: !item.is_active }); load() } catch {}
  }

  return (
    <div>
      <SectionHeader title="Unidades" onAdd={() => openModal(null)} />
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhuma unidade cadastrada" /> : (
        <div className="space-y-2">
          {items.map(u => (
            <div key={u.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                {u.address && <p className="text-xs text-gray-400 truncate">{u.address}</p>}
                {u.phone && <p className="text-xs text-gray-400">{u.phone}</p>}
              </div>
              <Toggle value={u.is_active} onChange={() => toggleActive(u)} />
              <button onClick={() => openModal(u)} className="text-xs text-violet-600 hover:underline font-medium">Editar</button>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <Modal title={modal.item ? 'Editar unidade' : 'Nova unidade'} onClose={() => setModal({ open: false, item: null })}>
          <div className="px-6 py-5 space-y-4">
            <Field label="Nome *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Clínica Centro" /></Field>
            <Field label="Endereço"><input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, bairro" /></Field>
            <Field label="Telefone"><input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 0000-0000" /></Field>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
            <button onClick={() => setModal({ open: false, item: null })} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Chairs tab ───────────────────────────────────────────────────────────────

function ChairsTab() {
  const [items, setItems]   = useState<Chair[]>([])
  const [units, setUnits]   = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState<{ open: boolean; item: Chair | null }>({ open: false, item: null })
  const [name, setName]     = useState('')
  const [unitId, setUnitId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [filterUnit, setFilterUnit] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [chairs, units] = await Promise.all([
        api.get<Chair[]>('/api/admin/chairs'),
        api.get<Unit[]>('/api/admin/units'),
      ])
      setItems(chairs)
      setUnits(units)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openModal(item: Chair | null) {
    setModal({ open: true, item })
    setName(item?.name ?? '')
    setUnitId(item?.unit_id ?? (units[0]?.id ?? ''))
    setError('')
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    if (!unitId) { setError('Selecione uma unidade'); return }
    setSaving(true); setError('')
    try {
      if (modal.item) {
        await api.patch(`/api/admin/chairs/${modal.item.id}`, { name: name.trim() })
      } else {
        await api.post('/api/admin/chairs', { name: name.trim(), unit_id: unitId })
      }
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: Chair) {
    try { await api.patch(`/api/admin/chairs/${item.id}`, { is_active: !item.is_active }); load() } catch {}
  }

  const visible = filterUnit ? items.filter(c => c.unit_id === filterUnit) : items

  return (
    <div>
      <SectionHeader title="Cadeiras / Consultórios" onAdd={() => openModal(null)} />

      {units.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setFilterUnit('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${!filterUnit ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>Todas</button>
          {units.map(u => (
            <button key={u.id} onClick={() => setFilterUnit(u.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filterUnit === u.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>{u.name}</button>
          ))}
        </div>
      )}

      {loading ? <LoadingState /> : visible.length === 0 ? <EmptyState label="Nenhuma cadeira cadastrada" /> : (
        <div className="space-y-2">
          {visible.map(c => (
            <div key={c.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                {c.unit && <p className="text-xs text-gray-400">{c.unit.name}</p>}
              </div>
              <Toggle value={c.is_active} onChange={() => toggleActive(c)} />
              <button onClick={() => openModal(c)} className="text-xs text-violet-600 hover:underline font-medium">Editar</button>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <Modal title={modal.item ? 'Editar cadeira' : 'Nova cadeira'} onClose={() => setModal({ open: false, item: null })}>
          <div className="px-6 py-5 space-y-4">
            <Field label="Nome *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Cadeira 1" /></Field>
            {!modal.item && (
              <Field label="Unidade *">
                <select className={inputCls} value={unitId} onChange={e => setUnitId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
            <button onClick={() => setModal({ open: false, item: null })} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Procedures tab ──────────────────────────────────────────────────────────

const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

function ProceduresTab() {
  const [items, setItems]   = useState<Procedure[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState<{ open: boolean; item: Procedure | null }>({ open: false, item: null })
  const [name, setName]     = useState('')
  const [duration, setDuration] = useState(30)
  const [color, setColor]   = useState('#3b82f6')
  const [specialty, setSpecialty] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await api.get<Procedure[]>('/api/admin/procedures')) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openModal(item: Procedure | null) {
    setModal({ open: true, item })
    setName(item?.name ?? '')
    setDuration(item?.duration_minutes ?? 30)
    setColor(item?.color ?? '#3b82f6')
    setSpecialty(item?.required_specialty ?? '')
    setError('')
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError('')
    try {
      const payload = { name: name.trim(), duration_minutes: duration, color, required_specialty: specialty || undefined }
      if (modal.item) {
        await api.patch(`/api/admin/procedures/${modal.item.id}`, payload)
      } else {
        await api.post('/api/admin/procedures', payload)
      }
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: Procedure) {
    try { await api.patch(`/api/admin/procedures/${item.id}`, { is_active: !item.is_active }); load() } catch {}
  }

  return (
    <div>
      <SectionHeader title="Procedimentos" onAdd={() => openModal(null)} />
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhum procedimento cadastrado" /> : (
        <div className="space-y-2">
          {items.map(p => (
            <div key={p.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color ?? '#6b7280' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                <p className="text-xs text-gray-400">{p.duration_minutes} min{p.required_specialty ? ` · ${p.required_specialty}` : ''}</p>
              </div>
              <Toggle value={p.is_active} onChange={() => toggleActive(p)} />
              <button onClick={() => openModal(p)} className="text-xs text-violet-600 hover:underline font-medium">Editar</button>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <Modal title={modal.item ? 'Editar procedimento' : 'Novo procedimento'} onClose={() => setModal({ open: false, item: null })}>
          <div className="px-6 py-5 space-y-4">
            <Field label="Nome *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Limpeza dental" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duração (min) *">
                <input type="number" min={5} step={5} className={inputCls} value={duration} onChange={e => setDuration(Number(e.target.value))} />
              </Field>
              <Field label="Especialidade">
                <input className={inputCls} value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Opcional" />
              </Field>
            </div>
            <Field label="Cor">
              <div className="flex flex-wrap gap-2 mt-1">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-violet-400' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Field>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
            <button onClick={() => setModal({ open: false, item: null })} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Dentists tab ────────────────────────────────────────────────────────────

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DENTIST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

function SchedulesModal({ dentist, onClose }: { dentist: Dentist; onClose: () => void }) {
  const [units, setUnits]         = useState<Unit[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading]     = useState(true)
  const [day, setDay]             = useState(1)
  const [start, setStart]         = useState('08:00')
  const [end, setEnd]             = useState('18:00')
  const [unitId, setUnitId]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, u] = await Promise.all([
        api.get<Schedule[]>(`/api/admin/dentists/${dentist.id}/schedules`),
        api.get<Unit[]>('/api/admin/units'),
      ])
      setSchedules(s)
      setUnits(u)
      if (u[0] && !unitId) setUnitId(u[0].id)
    } catch {} finally { setLoading(false) }
  }, [dentist.id])

  useEffect(() => { load() }, [load])

  async function addSchedule() {
    if (!unitId) { setError('Selecione uma unidade'); return }
    if (start >= end) { setError('Horário de início deve ser antes do fim'); return }
    setSaving(true); setError('')
    try {
      await api.post(`/api/admin/dentists/${dentist.id}/schedules`, { unit_id: unitId, day_of_week: day, start_time: start, end_time: end })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function removeSchedule(id: string) {
    try {
      await api.delete(`/api/admin/dentists/${dentist.id}/schedules/${id}`)
      load()
    } catch {}
  }

  return (
    <Modal title={`Horários — ${dentist.user?.name ?? 'Dentista'}`} onClose={onClose}>
      <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
        {loading ? <LoadingState /> : schedules.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Nenhum horário cadastrado</p>
        ) : (
          <div className="space-y-2">
            {schedules.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-xs font-bold text-violet-600 w-8">{DAYS[s.day_of_week]}</span>
                <span className="text-xs text-gray-700 flex-1">{s.start_time.slice(0,5)} – {s.end_time.slice(0,5)}</span>
                {s.unit && <span className="text-xs text-gray-400">{s.unit.name}</span>}
                <button onClick={() => removeSchedule(s.id)} className="text-red-400 hover:text-red-600 text-sm leading-none font-bold">×</button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-100 pt-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Adicionar horário</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label="Dia">
              <select className={inputCls} value={day} onChange={e => setDay(Number(e.target.value))}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </Field>
            <Field label="Unidade">
              <select className={inputCls} value={unitId} onChange={e => setUnitId(e.target.value)}>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Início"><input type="time" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></Field>
            <Field label="Fim"><input type="time" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></Field>
          </div>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Fechar</button>
        <button onClick={addSchedule} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">{saving ? 'Salvando...' : '+ Adicionar'}</button>
      </div>
    </Modal>
  )
}

function DentistsTab() {
  const [items, setItems]   = useState<Dentist[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState<{ open: boolean; item: Dentist | null }>({ open: false, item: null })
  const [schedulesFor, setSchedulesFor] = useState<Dentist | null>(null)
  const [name, setName]         = useState('')
  const [externalId, setExternalId] = useState('')
  const [email, setEmail]       = useState('')
  const [cro, setCro]           = useState('')
  const [specialty, setSpecialty] = useState('')
  const [color, setColor]       = useState(DENTIST_COLORS[0])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await api.get<Dentist[]>('/api/admin/dentists')) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function initials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() }

  function openModal(item: Dentist | null) {
    setModal({ open: true, item })
    setName(item?.user?.name ?? '')
    setExternalId(item?.user?.external_id ?? '')
    setEmail(item?.user?.email ?? '')
    setCro(item?.cro ?? '')
    setSpecialty(item?.specialty?.join(', ') ?? '')
    setColor(item?.color ?? DENTIST_COLORS[0])
    setError('')
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    if (!modal.item && !externalId.trim()) { setError('ID externo é obrigatório'); return }
    setSaving(true); setError('')
    try {
      const specialtyArr = specialty.split(',').map(s => s.trim()).filter(Boolean)
      const payload = { name: name.trim(), email: email || undefined, cro: cro || undefined, specialty: specialtyArr, color }
      if (modal.item) {
        await api.patch(`/api/admin/dentists/${modal.item.id}`, payload)
      } else {
        await api.post('/api/admin/dentists', { ...payload, external_id: externalId.trim() })
      }
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function removeDentist(id: string) {
    if (!confirm('Remover este profissional? Esta ação não pode ser desfeita.')) return
    try { await api.delete(`/api/admin/dentists/${id}`); load() } catch {}
  }

  return (
    <div>
      <SectionHeader title="Profissionais" onAdd={() => openModal(null)} />
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhum profissional cadastrado" /> : (
        <div className="space-y-2">
          {items.map(d => (
            <div key={d.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                style={{ background: d.color ?? '#a855f7' }}>
                {initials(d.user?.name ?? '?')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{d.user?.name ?? '—'}</p>
                <p className="text-xs text-gray-400">
                  {d.cro ? `CRO: ${d.cro}` : ''}
                  {d.cro && d.specialty?.length > 0 ? ' · ' : ''}
                  {d.specialty?.join(', ')}
                </p>
              </div>
              <button onClick={() => setSchedulesFor(d)} className="text-xs text-violet-600 hover:underline font-medium px-2">Horários</button>
              <button onClick={() => openModal(d)} className="text-xs text-violet-600 hover:underline font-medium">Editar</button>
              <button onClick={() => removeDentist(d.id)} className="text-xs text-red-400 hover:text-red-600 hover:underline font-medium">Excluir</button>
            </div>
          ))}
        </div>
      )}

      {schedulesFor && <SchedulesModal dentist={schedulesFor} onClose={() => setSchedulesFor(null)} />}

      {modal.open && (
        <Modal title={modal.item ? 'Editar profissional' : 'Novo profissional'} onClose={() => setModal({ open: false, item: null })}>
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <Field label="Nome completo *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Nome Sobrenome" /></Field>
            {!modal.item && (
              <Field label="Email *">
                <input className={inputCls} value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="email@clinica.com" type="email" />
                <p className="text-[11px] text-gray-400 mt-1">Usado para login via URL. Deve ser único na conta.</p>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-mail"><input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@clinica.com" /></Field>
              <Field label="CRO"><input className={inputCls} value={cro} onChange={e => setCro(e.target.value)} placeholder="CRO/SP 00000" /></Field>
            </div>
            <Field label="Especialidades">
              <input className={inputCls} value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Ortodontia, Implante (separar por vírgula)" />
            </Field>
            <Field label="Cor na agenda">
              <div className="flex flex-wrap gap-2 mt-1">
                {DENTIST_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-violet-400' : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </Field>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
            <button onClick={() => setModal({ open: false, item: null })} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── API Keys tab ────────────────────────────────────────────────────────────

function ApiKeysTab() {
  const [items, setItems]   = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await api.get<ApiKey[]>('/api/admin/api-keys')) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!label.trim()) { setError('Informe um nome para a chave'); return }
    setSaving(true); setError('')
    try {
      const res = await api.post<ApiKey & { key: string }>('/api/admin/api-keys', { label: label.trim() })
      setNewKey(res.key)
      setLabel('')
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar chave')
    } finally { setSaving(false) }
  }

  async function toggle(item: ApiKey) {
    try { await api.patch(`/api/admin/api-keys/${item.id}`, { is_active: !item.is_active }); load() } catch {}
  }

  async function remove(id: string) {
    if (!confirm('Revogar esta chave? Integrações que a usam vão parar de funcionar.')) return
    try { await api.delete(`/api/admin/api-keys/${id}`); load() } catch {}
  }

  return (
    <div>
      <SectionHeader title="Chaves de API" />
      <p className="text-xs text-gray-400 mb-4">Usadas pelo agente de IA (N8N) para autenticar na Escala Agenda. A chave é exibida uma única vez ao criar.</p>

      {newKey && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-800 mb-2">Chave criada — copie agora, ela não será exibida novamente:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-emerald-200 rounded-lg px-3 py-2 text-emerald-900 break-all font-mono">{newKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(newKey); setNewKey(null) }}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors whitespace-nowrap">
              Copiar e fechar
            </button>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhuma chave criada" /> : (
        <div className="space-y-2 mb-6">
          {items.map(k => (
            <div key={k.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${k.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{k.label}</p>
                <p className="text-xs text-gray-400">
                  {k.last_used_at ? `Último uso: ${new Date(k.last_used_at).toLocaleDateString('pt-BR')}` : 'Nunca usada'}
                  {' · '}{new Date(k.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <Toggle value={k.is_active} onChange={() => toggle(k)} />
              <button onClick={() => remove(k.id)} className="text-xs text-red-400 hover:text-red-600 hover:underline font-medium">Revogar</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 pt-5">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Nova chave</p>
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Ex: Agente N8N Produção" onKeyDown={e => e.key === 'Enter' && create()} />
          <button onClick={create} disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap">
            {saving ? '...' : 'Criar'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'unidades',       label: 'Unidades',       icon: '🏥' },
  { id: 'cadeiras',       label: 'Cadeiras',        icon: '🪑' },
  { id: 'procedimentos',  label: 'Procedimentos',   icon: '🦷' },
  { id: 'profissionais',  label: 'Profissionais',   icon: '👨‍⚕️' },
  { id: 'api-keys',       label: 'API Keys',        icon: '🔑' },
]

export default function ConfiguracoesPage() {
  const params       = useParams()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const accountId    = params?.accountId as string
  const userId       = searchParams?.get('userId') ?? ''
  const userQuery    = userId ? `?userId=${userId}` : ''
  const [tab, setTab] = useState<Tab>('unidades')

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push(`/${accountId}/agenda${userQuery}`)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          ‹
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">Configurações</h1>
          <p className="text-xs text-gray-400">Gerencie sua clínica</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {tab === 'unidades'      && <UnitsTab />}
        {tab === 'cadeiras'      && <ChairsTab />}
        {tab === 'procedimentos' && <ProceduresTab />}
        {tab === 'profissionais' && <DentistsTab />}
        {tab === 'api-keys'      && <ApiKeysTab />}
      </div>
    </div>
  )
}
