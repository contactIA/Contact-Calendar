'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAnimatedMount } from '@/hooks/useAnimatedMount'
import { format, differenceInYears, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '@/lib/client'

type Patient = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  birth_date?: string | null
  notes?: string | null
  created_at: string
}

type ListResult = { data: Patient[]; total: number; page: number; page_size: number }

function age(birth_date: string | null | undefined) {
  if (!birth_date) return null
  try { return differenceInYears(new Date(), parseISO(birth_date)) } catch { return null }
}

function formatPhone(p: string | null | undefined) {
  if (!p) return '—'
  const d = p.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return p
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const AVATAR_COLORS = [
  '#a855f7', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6',
]
function avatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

// ─── Edit / Create Modal ───────────────────────────────────────────────────

type ModalProps = {
  open: boolean
  patient: Patient | null
  onClose: () => void
  onSaved: (p: Patient) => void
  accountId: string
}

function PatientModal({ open, patient, onClose, onSaved, accountId }: ModalProps) {
  const { mounted, closing } = useAnimatedMount(open, 180)
  const isNew = !patient
  const [name, setName]           = useState(patient?.name ?? '')
  const [phone, setPhone]         = useState(patient?.phone ?? '')
  const [email, setEmail]         = useState(patient?.email ?? '')
  const [birthDate, setBirthDate] = useState(patient?.birth_date ?? '')
  const [notes, setNotes]         = useState(patient?.notes ?? '')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError('')
    try {
      const payload: Record<string, string> = { name: name.trim() }
      if (phone) payload.phone = phone
      if (email) payload.email = email
      if (birthDate) payload.birth_date = birthDate
      if (notes) payload.notes = notes

      let saved: Patient
      if (isNew) {
        saved = await api.post<Patient>(`/api/patients`, payload)
      } else {
        saved = await api.patch<Patient>(`/api/patients/${patient!.id}`, payload)
      }
      onSaved(saved)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden ${closing ? 'animate-modal-out' : 'animate-modal-in'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {isNew ? 'Novo paciente' : 'Editar paciente'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
              value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Telefone</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
                value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Nascimento</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
                value={birthDate} onChange={e => setBirthDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">E-mail</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações</label>
            <textarea
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 resize-none"
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="Informações adicionais..."
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function PacientesPage() {
  const params       = useParams()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const accountId    = params?.accountId as string
  const userId       = searchParams?.get('userId') ?? ''
  const userQuery    = userId ? `?userId=${userId}` : ''

  const [patients, setPatients] = useState<Patient[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading]   = useState(false)
  const [modal, setModal]       = useState<{ open: boolean; patient: Patient | null }>({ open: false, patient: null })
  const PAGE_SIZE = 50
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (q: string, pg: number) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(pg), page_size: String(PAGE_SIZE) })
      if (q.length >= 3) qs.set('q', q)
      const res = await api.get<ListResult>(`/api/patients?${qs}`)
      setPatients(res.data)
      setTotal(res.total)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(search, page) }, [search, page, load])

  function handleSearchInput(val: string) {
    setInputValue(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(val)
      setPage(1)
    }, 400)
  }

  function handleSaved(p: Patient) {
    setModal({ open: false, patient: null })
    if (modal.patient) {
      setPatients(prev => prev.map(x => x.id === p.id ? p : x))
    } else {
      load(search, page)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push(`/${accountId}/agenda${userQuery}`)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Voltar à agenda"
        >
          ‹
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">Pacientes</h1>
          <p className="text-xs text-gray-400">{total} paciente{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
        </div>

        {/* Search */}
        <div className="relative w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 bg-gray-50"
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={inputValue}
            onChange={e => handleSearchInput(e.target.value)}
          />
          {inputValue && (
            <button
              onClick={() => { setInputValue(''); setSearch(''); setPage(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ×
            </button>
          )}
        </div>

        <button
          onClick={() => setModal({ open: true, patient: null })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 transition-opacity"
        >
          <span>+</span>
          Novo paciente
        </button>
      </div>

      {/* Table */}
      <div className="px-6 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading && patients.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">👥</span>
              <p className="text-sm font-semibold text-gray-600 mb-1">
                {search ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                {search ? `Sem resultados para "${search}"` : 'Clique em "Novo paciente" para começar'}
              </p>
              {!search && (
                <button
                  onClick={() => setModal({ open: true, patient: null })}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors"
                >
                  + Novo paciente
                </button>
              )}
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Paciente</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Telefone</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">E-mail</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Idade</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Cadastrado em</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {patients.map(p => {
                    const a = age(p.birth_date)
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                              style={{ background: avatarColor(p.id) }}
                            >
                              {initials(p.name)}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-800">{p.name}</div>
                              {p.notes && (
                                <div className="text-[11px] text-gray-400 truncate max-w-[200px]">{p.notes}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-600">{formatPhone(p.phone)}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-600">{p.email ?? '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-600">{a !== null ? `${a} anos` : '—'}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-400">
                          {format(new Date(p.created_at), "d MMM yyyy", { locale: ptBR })}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              onClick={() => setModal({ open: true, patient: p })}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => router.push(`/${accountId}/agenda${userQuery}`)}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-violet-600 hover:bg-violet-50 transition-colors"
                            >
                              Agendar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-500">
                    Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 hover:bg-violet-50 border border-violet-200 disabled:opacity-40 transition-colors"
                    >
                      ‹ Anterior
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 hover:bg-violet-50 border border-violet-200 disabled:opacity-40 transition-colors"
                    >
                      Próximo ›
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <PatientModal
        open={modal.open}
        patient={modal.patient}
        onClose={() => setModal({ open: false, patient: null })}
        onSaved={handleSaved}
        accountId={accountId}
      />
    </div>
  )
}
