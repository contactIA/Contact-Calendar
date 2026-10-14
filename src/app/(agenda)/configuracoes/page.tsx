'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type {
  CadeiraJson,
  ChaveJson,
  EspecialidadeJson,
  ExpedienteJson,
  ProcedimentoJson,
  ProfissionalJson,
  UnidadeJson,
} from '@/api/v1/esquemas'
import { CADENCIAS_DA_GRADE } from '@/compartilhado/vocabulario'
import { useEu } from '@/componentes/casca'
import { api, fraseDoErro } from '@/componentes/cliente/api'

// Os cadastros da clínica, sobre a API v1 (fase 6 da migração). Só o gestor: a
// API recusa o resto. Nada se apaga, se desativa: a consulta antiga continua
// apontando para a cadeira e o procedimento dela. A integração com a plataforma
// de mensagens volta na fase 7, com a ligação ao CRM.

type Tab = 'geral' | 'unidades' | 'cadeiras' | 'especialidades' | 'procedimentos' | 'profissionais' | 'chaves'

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

function Toggle({ value, onChange, title }: { value: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button
      onClick={() => onChange(!value)}
      title={title ?? (value ? 'Ativo: clique para desativar' : 'Inativo: clique para ativar')}
      className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-violet-600' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
    </button>
  )
}

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

/** Os botões do pé do modal: cancelar e salvar. */
function Rodape({ onCancel, onSave, saving, salvar = 'Salvar' }: { onCancel: () => void; onSave: () => void; saving: boolean; salvar?: string }) {
  return (
    <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
      <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
      <button onClick={onSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">{saving ? 'Salvando...' : salvar}</button>
    </div>
  )
}

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"

const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

function Cores({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {PRESET_COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full transition-transform ${value === c ? 'scale-125 ring-2 ring-offset-1 ring-violet-400' : ''}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

/** Uma lista que a aba carrega da API, com o recarregar. */
function useLista<T>(carregar: () => Promise<T>, inicial: T) {
  const [dados, setDados] = useState<T>(inicial)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try { setDados(await carregar()); setErro('') } catch (e) { setErro(fraseDoErro(e)) } finally { setLoading(false) }
    // carregar é estável por aba: cada uma passa uma função fixa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { void Promise.resolve().then(load) }, [load])
  return { dados, loading, erro, load }
}

// ─── Geral ───────────────────────────────────────────────────────────────────

function GeralTab() {
  const eu = useEu()
  const [salva, setSalva] = useState(eu.clinica.cadenciaMinutos)
  const [interval, setIntervalValue] = useState(eu.clinica.cadenciaMinutos)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      await api.patch('/clinica', { cadenciaMinutos: interval })
      setSalva(interval)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally { setSaving(false) }
  }

  return (
    <div>
      <SectionHeader title="Configurações gerais" />
      <div className="bg-white border border-gray-100 rounded-xl px-5 py-5 space-y-5">
        <div>
          <Field label="Cadência da grade de horários">
            <select className={inputCls} value={interval} onChange={e => setIntervalValue(Number(e.target.value))}>
              {CADENCIAS_DA_GRADE.map(v => <option key={v} value={v}>{v} minutos</option>)}
            </select>
          </Field>
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
            De quanto em quanto tempo um horário de início é oferecido (ex.: 30 min, então 14:00, 14:30, 15:00…).
            A <strong>duração de cada procedimento</strong> continua sendo respeitada de forma independente:
            um procedimento de 90 min reserva os 90 min, sem encaixar outra consulta no meio.
          </p>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving || interval === salva}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-40 transition-opacity">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {saved && <span className="text-xs font-medium text-emerald-600">✓ Salvo</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Unidades ────────────────────────────────────────────────────────────────

function UnitsTab() {
  const { dados: items, loading, erro, load } = useLista(async () => (await api.get<{ unidades: UnidadeJson[] }>('/unidades')).unidades, [])
  const [modal, setModal]   = useState<{ open: boolean; item: UnidadeJson | null }>({ open: false, item: null })
  const [name, setName]     = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function openModal(item: UnidadeJson | null) {
    setModal({ open: true, item })
    setName(item?.nome ?? '')
    setAddress(item?.endereco ?? '')
    setPhone(item?.telefone ?? '')
    setError('')
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError('')
    try {
      const payload = { nome: name.trim(), endereco: address.trim() || null, telefone: phone.trim() || null }
      if (modal.item) await api.patch(`/unidades/${modal.item.id}`, payload)
      else await api.post('/unidades', payload)
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: UnidadeJson) {
    try { await api.patch(`/unidades/${item.id}`, { ativa: !item.ativa }); load() } catch (e) { alert(fraseDoErro(e)) }
  }

  return (
    <div>
      <SectionHeader title="Unidades" onAdd={() => openModal(null)} />
      {erro && <p className="text-xs text-red-500 mb-3">{erro}</p>}
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhuma unidade cadastrada" /> : (
        <div className="space-y-2">
          {items.map(u => (
            <div key={u.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{u.nome}</p>
                {u.endereco && <p className="text-xs text-gray-400 truncate">{u.endereco}</p>}
                {u.telefone && <p className="text-xs text-gray-400">{u.telefone}</p>}
              </div>
              <Toggle value={u.ativa} onChange={() => toggleActive(u)} />
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
          <Rodape onCancel={() => setModal({ open: false, item: null })} onSave={save} saving={saving} />
        </Modal>
      )}
    </div>
  )
}

// ─── Cadeiras ────────────────────────────────────────────────────────────────

function ChairsTab() {
  const { dados, loading, erro, load } = useLista(async () => {
    const [{ cadeiras }, { unidades }] = await Promise.all([
      api.get<{ cadeiras: CadeiraJson[] }>('/cadeiras'),
      api.get<{ unidades: UnidadeJson[] }>('/unidades'),
    ])
    return { cadeiras, unidades }
  }, { cadeiras: [] as CadeiraJson[], unidades: [] as UnidadeJson[] })
  const { cadeiras: items, unidades: units } = dados
  const [modal, setModal]   = useState<{ open: boolean; item: CadeiraJson | null }>({ open: false, item: null })
  const [name, setName]     = useState('')
  const [unitId, setUnitId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [filterUnit, setFilterUnit] = useState<string>('')

  const nomeDaUnidade = (id: string) => units.find(u => u.id === id)?.nome

  function openModal(item: CadeiraJson | null) {
    setModal({ open: true, item })
    setName(item?.nome ?? '')
    setUnitId(item?.unidadeId ?? (units.find(u => u.ativa)?.id ?? ''))
    setError('')
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    if (!unitId) { setError('Selecione uma unidade'); return }
    setSaving(true); setError('')
    try {
      if (modal.item) await api.patch(`/cadeiras/${modal.item.id}`, { nome: name.trim() })
      else await api.post('/cadeiras', { nome: name.trim(), unidadeId: unitId })
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: CadeiraJson) {
    try { await api.patch(`/cadeiras/${item.id}`, { ativa: !item.ativa }); load() } catch (e) { alert(fraseDoErro(e)) }
  }

  const visible = filterUnit ? items.filter(c => c.unidadeId === filterUnit) : items

  return (
    <div>
      <SectionHeader title="Cadeiras / Consultórios" onAdd={() => openModal(null)} />
      {erro && <p className="text-xs text-red-500 mb-3">{erro}</p>}

      {units.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setFilterUnit('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${!filterUnit ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>Todas</button>
          {units.map(u => (
            <button key={u.id} onClick={() => setFilterUnit(u.id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filterUnit === u.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>{u.nome}</button>
          ))}
        </div>
      )}

      {loading ? <LoadingState /> : visible.length === 0 ? <EmptyState label="Nenhuma cadeira cadastrada" /> : (
        <div className="space-y-2">
          {visible.map(c => (
            <div key={c.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{c.nome}</p>
                {nomeDaUnidade(c.unidadeId) && <p className="text-xs text-gray-400">{nomeDaUnidade(c.unidadeId)}</p>}
              </div>
              <Toggle value={c.ativa} onChange={() => toggleActive(c)} />
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
                  {units.filter(u => u.ativa).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Field>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <Rodape onCancel={() => setModal({ open: false, item: null })} onSave={save} saving={saving} />
        </Modal>
      )}
    </div>
  )
}

// ─── Especialidades ──────────────────────────────────────────────────────────

function EspecialidadesTab() {
  const { dados: items, loading, erro, load } = useLista(async () => (await api.get<{ especialidades: EspecialidadeJson[] }>('/especialidades')).especialidades, [])
  const [modal, setModal]   = useState<{ open: boolean; item: EspecialidadeJson | null }>({ open: false, item: null })
  const [name, setName]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function openModal(item: EspecialidadeJson | null) {
    setModal({ open: true, item })
    setName(item?.nome ?? '')
    setError('')
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError('')
    try {
      if (modal.item) await api.patch(`/especialidades/${modal.item.id}`, { nome: name.trim() })
      else await api.post('/especialidades', { nome: name.trim() })
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove(item: EspecialidadeJson) {
    if (!confirm(`Apagar a especialidade ${item.nome}?`)) return
    // A API recusa a que um procedimento ou profissional ainda usa, com a frase do motivo.
    try { await api.delete(`/especialidades/${item.id}`); load() } catch (e) { alert(fraseDoErro(e)) }
  }

  return (
    <div>
      <SectionHeader title="Especialidades" onAdd={() => openModal(null)} />
      <p className="text-xs text-gray-400 mb-4">O procedimento que exige uma especialidade só aparece para os profissionais que a têm.</p>
      {erro && <p className="text-xs text-red-500 mb-3">{erro}</p>}
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhuma especialidade cadastrada" /> : (
        <div className="space-y-2">
          {items.map(e => (
            <div key={e.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <p className="flex-1 min-w-0 text-sm font-semibold text-gray-800">{e.nome}</p>
              <button onClick={() => openModal(e)} className="text-xs text-violet-600 hover:underline font-medium">Editar</button>
              <button onClick={() => remove(e)} className="text-xs text-red-400 hover:text-red-600 hover:underline font-medium">Apagar</button>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <Modal title={modal.item ? 'Editar especialidade' : 'Nova especialidade'} onClose={() => setModal({ open: false, item: null })}>
          <div className="px-6 py-5 space-y-4">
            <Field label="Nome *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Ortodontia" /></Field>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <Rodape onCancel={() => setModal({ open: false, item: null })} onSave={save} saving={saving} />
        </Modal>
      )}
    </div>
  )
}

// ─── Procedimentos ───────────────────────────────────────────────────────────

function ProceduresTab() {
  const { dados, loading, erro, load } = useLista(async () => {
    const [{ procedimentos }, { especialidades }] = await Promise.all([
      api.get<{ procedimentos: ProcedimentoJson[] }>('/procedimentos'),
      api.get<{ especialidades: EspecialidadeJson[] }>('/especialidades'),
    ])
    return { procedimentos, especialidades }
  }, { procedimentos: [] as ProcedimentoJson[], especialidades: [] as EspecialidadeJson[] })
  const { procedimentos: items, especialidades } = dados
  const [modal, setModal]   = useState<{ open: boolean; item: ProcedimentoJson | null }>({ open: false, item: null })
  const [name, setName]     = useState('')
  const [duration, setDuration] = useState(30)
  const [color, setColor]   = useState(PRESET_COLORS[0]!)
  const [specialty, setSpecialty] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const nomeDaEspecialidade = (id: string | null) => (id ? especialidades.find(e => e.id === id)?.nome : undefined)

  function openModal(item: ProcedimentoJson | null) {
    setModal({ open: true, item })
    setName(item?.nome ?? '')
    setDuration(item?.duracaoMinutos ?? 30)
    setColor(item?.cor ?? PRESET_COLORS[0]!)
    setSpecialty(item?.especialidadeId ?? '')
    setError('')
  }

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError('')
    try {
      const payload = { nome: name.trim(), duracaoMinutos: duration, cor: color, especialidadeId: specialty || null }
      if (modal.item) await api.patch(`/procedimentos/${modal.item.id}`, payload)
      else await api.post('/procedimentos', payload)
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: ProcedimentoJson) {
    try { await api.patch(`/procedimentos/${item.id}`, { ativo: !item.ativo }); load() } catch (e) { alert(fraseDoErro(e)) }
  }

  return (
    <div>
      <SectionHeader title="Procedimentos" onAdd={() => openModal(null)} />
      {erro && <p className="text-xs text-red-500 mb-3">{erro}</p>}
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhum procedimento cadastrado" /> : (
        <div className="space-y-2">
          {items.map(p => (
            <div key={p.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.cor }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{p.nome}</p>
                <p className="text-xs text-gray-400">{p.duracaoMinutos} min{nomeDaEspecialidade(p.especialidadeId) ? ` · ${nomeDaEspecialidade(p.especialidadeId)}` : ''}</p>
              </div>
              <Toggle value={p.ativo} onChange={() => toggleActive(p)} />
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
                <input type="number" min={5} max={480} step={5} className={inputCls} value={duration} onChange={e => setDuration(Number(e.target.value))} />
              </Field>
              <Field label="Especialidade">
                <select className={inputCls} value={specialty} onChange={e => setSpecialty(e.target.value)}>
                  <option value="">Qualquer profissional</option>
                  {especialidades.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Cor"><Cores value={color} onChange={setColor} /></Field>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <Rodape onCancel={() => setModal({ open: false, item: null })} onSave={save} saving={saving} />
        </Modal>
      )}
    </div>
  )
}

// ─── Profissionais ───────────────────────────────────────────────────────────

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/**
 * O expediente da semana do profissional: vários intervalos por dia, em cada
 * unidade onde ele atende. A API troca a semana inteira de uma vez.
 */
function ExpedientesModal({ profissional, unidades, onClose }: { profissional: ProfissionalJson; unidades: UnidadeJson[]; onClose: () => void }) {
  const ondeAtende = unidades.filter(u => profissional.unidades.some(x => x.unidadeId === u.id))
  const nomeDaUnidade = (id: string) => unidades.find(u => u.id === id)?.nome ?? ''
  const [semana, setSemana]   = useState<ExpedienteJson[]>([])
  const [loading, setLoading] = useState(true)
  const [day, setDay]         = useState(1)
  const [start, setStart]     = useState('08:00')
  const [end, setEnd]         = useState('18:00')
  const [unitId, setUnitId]   = useState(ondeAtende[0]?.id ?? '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    let cancelado = false
    api.get<{ expedientes: ExpedienteJson[] }>(`/profissionais/${profissional.id}/expedientes`)
      .then(r => { if (!cancelado) setSemana(r.expedientes) })
      .catch(e => { if (!cancelado) setError(fraseDoErro(e)) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [profissional.id])

  async function gravar(nova: ExpedienteJson[]) {
    setSaving(true); setError('')
    try {
      const r = await api.put<{ expedientes: ExpedienteJson[] }>(`/profissionais/${profissional.id}/expedientes`, { expedientes: nova })
      setSemana(r.expedientes)
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally { setSaving(false) }
  }

  function addSchedule() {
    if (!unitId) { setError('Selecione uma unidade'); return }
    if (start >= end) { setError('O início precisa ser antes do fim'); return }
    void gravar([...semana, { unidadeId: unitId, diaSemana: day, inicio: start, fim: end }])
  }

  return (
    <Modal title={`Horários de ${profissional.nome}`} onClose={onClose}>
      <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
        {ondeAtende.length === 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2.5">Marque antes em Editar as unidades onde o profissional atende.</p>
        )}
        {loading ? <LoadingState /> : semana.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Nenhum horário cadastrado</p>
        ) : (
          <div className="space-y-2">
            {semana.map((s, i) => (
              <div key={`${s.unidadeId}-${s.diaSemana}-${s.inicio}`} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-xs font-bold text-violet-600 w-8">{DAYS[s.diaSemana]}</span>
                <span className="text-xs text-gray-700 flex-1">{s.inicio.slice(0, 5)} às {s.fim.slice(0, 5)}</span>
                <span className="text-xs text-gray-400">{nomeDaUnidade(s.unidadeId)}</span>
                <button onClick={() => void gravar(semana.filter((_, j) => j !== i))} disabled={saving} className="text-red-400 hover:text-red-600 text-sm leading-none font-bold" title="Tirar este horário">×</button>
              </div>
            ))}
          </div>
        )}

        {ondeAtende.length > 0 && (
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
                  {ondeAtende.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Início"><input type="time" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></Field>
              <Field label="Fim"><input type="time" className={inputCls} value={end} onChange={e => setEnd(e.target.value)} /></Field>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
      <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Fechar</button>
        {ondeAtende.length > 0 && (
          <button onClick={addSchedule} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">{saving ? 'Salvando...' : '+ Adicionar'}</button>
        )}
      </div>
    </Modal>
  )
}

function DentistsTab() {
  const { dados, loading, erro, load } = useLista(async () => {
    const [{ profissionais }, { unidades }, { especialidades }] = await Promise.all([
      api.get<{ profissionais: ProfissionalJson[] }>('/profissionais'),
      api.get<{ unidades: UnidadeJson[] }>('/unidades'),
      api.get<{ especialidades: EspecialidadeJson[] }>('/especialidades'),
    ])
    return { profissionais, unidades, especialidades }
  }, { profissionais: [] as ProfissionalJson[], unidades: [] as UnidadeJson[], especialidades: [] as EspecialidadeJson[] })
  const { profissionais: items, unidades, especialidades } = dados
  const [modal, setModal]   = useState<{ open: boolean; item: ProfissionalJson | null }>({ open: false, item: null })
  const [schedulesFor, setSchedulesFor] = useState<ProfissionalJson | null>(null)
  const [name, setName]         = useState('')
  const [cro, setCro]           = useState('')
  const [color, setColor]       = useState(PRESET_COLORS[0]!)
  const [specialties, setSpecialties] = useState<string[]>([])
  /** Onde atende, com a prioridade em cada unidade (menor vem primeiro na recomendação). */
  const [prioridades, setPrioridades] = useState<Record<string, number>>({})
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  function initials(n: string) { return n.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() }
  const nomeDaEspecialidade = (id: string) => especialidades.find(e => e.id === id)?.nome

  function openModal(item: ProfissionalJson | null) {
    setModal({ open: true, item })
    setName(item?.nome ?? '')
    setCro(item?.cro ?? '')
    setColor(item?.cor ?? PRESET_COLORS[0]!)
    setSpecialties(item?.especialidadeIds ?? [])
    setPrioridades(Object.fromEntries((item?.unidades ?? []).map(u => [u.unidadeId, u.prioridade])))
    setError('')
  }

  const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id])

  async function save() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        nome: name.trim(),
        cro: cro.trim() || null,
        cor: color,
        especialidadeIds: specialties,
        unidades: Object.entries(prioridades).map(([unidadeId, prioridade]) => ({ unidadeId, prioridade })),
      }
      if (modal.item) await api.patch(`/profissionais/${modal.item.id}`, payload)
      else await api.post('/profissionais', payload)
      setModal({ open: false, item: null })
      load()
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally { setSaving(false) }
  }

  async function toggleActive(item: ProfissionalJson) {
    try { await api.patch(`/profissionais/${item.id}`, { ativo: !item.ativo }); load() } catch (e) { alert(fraseDoErro(e)) }
  }

  return (
    <div>
      <SectionHeader title="Profissionais" onAdd={() => openModal(null)} />
      {erro && <p className="text-xs text-red-500 mb-3">{erro}</p>}
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhum profissional cadastrado" /> : (
        <div className="space-y-2">
          {items.map(d => (
            <div key={d.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                style={{ background: d.cor }}>
                {initials(d.nome)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{d.nome}</p>
                <p className="text-xs text-gray-400">
                  {[d.cro ? `CRO: ${d.cro}` : null, ...d.especialidadeIds.map(nomeDaEspecialidade)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => setSchedulesFor(d)} className="text-xs text-violet-600 hover:underline font-medium px-2">Horários</button>
              <Toggle value={d.ativo} onChange={() => toggleActive(d)} />
              <button onClick={() => openModal(d)} className="text-xs text-violet-600 hover:underline font-medium">Editar</button>
            </div>
          ))}
        </div>
      )}

      {schedulesFor && <ExpedientesModal profissional={schedulesFor} unidades={unidades} onClose={() => setSchedulesFor(null)} />}

      {modal.open && (
        <Modal title={modal.item ? 'Editar profissional' : 'Novo profissional'} onClose={() => setModal({ open: false, item: null })}>
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <Field label="Nome completo *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Nome Sobrenome" /></Field>
            <Field label="CRO"><input className={inputCls} value={cro} onChange={e => setCro(e.target.value)} placeholder="CRO/SP 00000" /></Field>
            <Field label="Onde atende (e a prioridade)">
              <div className="space-y-1.5 mt-1">
                {unidades.filter(u => u.ativa || prioridades[u.id] !== undefined).map(u => {
                  const marcada = prioridades[u.id] !== undefined
                  return (
                    <div key={u.id} className="flex items-center gap-3">
                      <label className="flex flex-1 items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => setPrioridades(p => {
                            const { [u.id]: _, ...resto } = p
                            return marcada ? resto : { ...p, [u.id]: 1 }
                          })}
                        />
                        {u.nome}
                      </label>
                      {marcada && (
                        <input
                          type="number" min={0} max={1000} title="Prioridade: menor vem primeiro na recomendação"
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm"
                          value={prioridades[u.id]}
                          onChange={e => setPrioridades(p => ({ ...p, [u.id]: Number(e.target.value) }))}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </Field>
            {especialidades.length > 0 && (
              <Field label="Especialidades">
                <div className="flex flex-wrap gap-2 mt-1">
                  {especialidades.map(e => (
                    <button key={e.id} onClick={() => setSpecialties(s => alternar(s, e.id))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${specialties.includes(e.id) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                      {e.nome}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Cor na agenda"><Cores value={color} onChange={setColor} /></Field>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <Rodape onCancel={() => setModal({ open: false, item: null })} onSave={save} saving={saving} />
        </Modal>
      )}
    </div>
  )
}

// ─── Chaves da API ───────────────────────────────────────────────────────────

const TIPO_DA_CHAVE: Record<ChaveJson['tipo'], string> = { ia: 'Agente de IA', integracao: 'Integração' }

function ChavesTab() {
  const { dados: items, loading, erro, load } = useLista(async () => (await api.get<{ chaves: ChaveJson[] }>('/chaves')).chaves, [])
  const [label, setLabel]   = useState('')
  const [tipo, setTipo]     = useState<ChaveJson['tipo']>('ia')
  const [podeEscrever, setPodeEscrever] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)

  async function create() {
    if (!label.trim()) { setError('Dê um nome à chave, para saber quem a usa'); return }
    setSaving(true); setError('')
    try {
      const res = await api.post<ChaveJson & { chave: string }>('/chaves', { nome: label.trim(), tipo, podeEscrever })
      setNewKey(res.chave)
      setLabel('')
      load()
    } catch (e: unknown) {
      setError(fraseDoErro(e))
    } finally { setSaving(false) }
  }

  async function revoke(item: ChaveJson) {
    if (!confirm(`Revogar a chave ${item.nome}? Quem a usa para de entrar na hora.`)) return
    try { await api.delete(`/chaves/${item.id}`); load() } catch (e) { alert(fraseDoErro(e)) }
  }

  const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

  return (
    <div>
      <SectionHeader title="Chaves da API" />
      <p className="text-xs text-gray-400 mb-4">Usadas pelo agente de IA e pelas integrações para entrar na agenda. A chave aparece uma vez só, ao criar.</p>

      {newKey && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-800 mb-2">Chave criada. Copie agora: ela não aparece de novo.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-emerald-200 rounded-lg px-3 py-2 text-emerald-900 break-all font-mono">{newKey}</code>
            <button onClick={() => { void navigator.clipboard.writeText(newKey); setNewKey(null) }}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors whitespace-nowrap">
              Copiar e fechar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-xs text-red-500 mb-3">{erro}</p>}
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState label="Nenhuma chave criada" /> : (
        <div className="space-y-2 mb-6">
          {items.map(k => (
            <div key={k.id} className={`flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 ${k.revogadaEm ? 'opacity-60' : ''}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${k.revogadaEm ? 'bg-gray-300' : 'bg-emerald-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{k.nome} <span className="font-mono text-xs font-normal text-gray-400">{k.prefixo}…</span></p>
                <p className="text-xs text-gray-400">
                  {TIPO_DA_CHAVE[k.tipo]} · {k.podeEscrever ? 'agenda e remarca' : 'só leitura'}
                  {' · '}{k.revogadaEm ? `revogada em ${data(k.revogadaEm)}` : k.ultimoUsoEm ? `último uso em ${data(k.ultimoUsoEm)}` : 'nunca usada'}
                </p>
              </div>
              {!k.revogadaEm && (
                <button onClick={() => revoke(k)} className="text-xs text-red-400 hover:text-red-600 hover:underline font-medium">Revogar</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 pt-5 space-y-3">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Nova chave</p>
        <div className="flex gap-2">
          <input className={`${inputCls} flex-1`} value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Ex: Agente de IA" onKeyDown={e => e.key === 'Enter' && create()} />
          <select className="border border-gray-200 rounded-xl px-3 text-sm" value={tipo} onChange={e => setTipo(e.target.value as ChaveJson['tipo'])}>
            <option value="ia">Agente de IA</option>
            <option value="integracao">Integração</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={podeEscrever} onChange={e => setPodeEscrever(e.target.checked)} />
          Pode agendar, remarcar, confirmar e cancelar
        </label>
        <button onClick={create} disabled={saving}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap">
          {saving ? '...' : 'Criar chave'}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'geral',          label: 'Geral',          icon: '⚙️' },
  { id: 'unidades',       label: 'Unidades',       icon: '🏥' },
  { id: 'cadeiras',       label: 'Cadeiras',       icon: '🪑' },
  { id: 'especialidades', label: 'Especialidades', icon: '🎓' },
  { id: 'procedimentos',  label: 'Procedimentos',  icon: '🦷' },
  { id: 'profissionais',  label: 'Profissionais',  icon: '👨‍⚕️' },
  { id: 'chaves',         label: 'Chaves',         icon: '🔑' },
]

export default function ConfiguracoesPage() {
  const router = useRouter()
  const gestor = useEu().usuario.papeis.gestor
  const [tab, setTab] = useState<Tab>('geral')

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/agenda')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Voltar à agenda"
        >
          ‹
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">Configurações</h1>
          <p className="text-xs text-gray-400">Gerencie sua clínica</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {!gestor ? (
          <EmptyState label="Os cadastros da clínica são do gestor." />
        ) : (
          <>
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

            {tab === 'geral'          && <GeralTab />}
            {tab === 'unidades'       && <UnitsTab />}
            {tab === 'cadeiras'       && <ChairsTab />}
            {tab === 'especialidades' && <EspecialidadesTab />}
            {tab === 'procedimentos'  && <ProceduresTab />}
            {tab === 'profissionais'  && <DentistsTab />}
            {tab === 'chaves'         && <ChavesTab />}
          </>
        )}
      </div>
    </div>
  )
}
