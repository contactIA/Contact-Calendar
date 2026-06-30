'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/client'

// Onboarding wizard para criar uma nova conta na Escala Agenda.
// Acessível sem autenticação — o token é gerado ao criar a conta.

type Step = 'account' | 'unit' | 'dentist' | 'procedure' | 'done'

const STEPS: { id: Step; label: string; desc: string }[] = [
  { id: 'account',   label: 'Conta',        desc: 'Dados da clínica' },
  { id: 'unit',      label: 'Unidade',      desc: 'Primeira unidade' },
  { id: 'dentist',   label: 'Profissional', desc: 'Primeiro dentista' },
  { id: 'procedure', label: 'Procedimento', desc: 'Primeiro procedimento' },
  { id: 'done',      label: 'Pronto',       desc: 'Tudo configurado' },
]

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
const COLORS   = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.id === current)
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.filter(s => s.id !== 'done').map((s, i) => {
        const done    = i < idx
        const active  = s.id === current
        return (
          <div key={s.id} className="flex items-center">
            <div className={`flex flex-col items-center ${i > 0 ? '' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${done ? 'bg-violet-600 text-white' : active ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-400' : 'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] mt-1 font-medium ${active ? 'text-violet-700' : done ? 'text-violet-500' : 'text-gray-400'}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 2 && <div className={`h-0.5 w-12 mx-1 mb-5 ${done ? 'bg-violet-400' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}

export default function OnboardingPage() {
  const router  = useRouter()
  const [step, setStep] = useState<Step>('account')

  // IDs criados nas etapas anteriores
  const [accountId,   setAccountId]   = useState('')
  const [unitId,      setUnitId]      = useState('')
  const [adminToken,  setAdminToken]  = useState('')

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // Step: account
  const [accName,       setAccName]       = useState('')
  const [accSlug,       setAccSlug]       = useState('')
  const [adminName,     setAdminName]     = useState('')
  const [adminExtId,    setAdminExtId]    = useState('')

  // Step: unit
  const [unitName,    setUnitName]    = useState('')
  const [unitAddress, setUnitAddress] = useState('')

  // Step: dentist
  const [dentName,      setDentName]      = useState('')
  const [dentExtId,     setDentExtId]     = useState('')
  const [dentCro,       setDentCro]       = useState('')
  const [dentSpecialty, setDentSpecialty] = useState('')
  const [dentColor,     setDentColor]     = useState(COLORS[0])

  // Step: procedure
  const [procName,     setProcName]     = useState('')
  const [procDuration, setProcDuration] = useState(60)
  const [procColor,    setProcColor]    = useState(COLORS[0])

  function slugify(s: string) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') }

  async function createAccount() {
    if (!accName.trim() || !adminName.trim() || !adminExtId.trim()) {
      setError('Preencha todos os campos obrigatórios'); return
    }
    const slug = accSlug || slugify(accName)
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/onboarding/account', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: accName.trim(), slug, admin_name: adminName.trim(), admin_external_id: adminExtId.trim() }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Erro ao criar conta'); }
      const data = await res.json()
      setAccountId(data.account_id)
      setAdminToken(data.token)
      // Armazena o token para as próximas chamadas
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('escala_jwt', data.token)
      }
      setStep('unit')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar conta')
    } finally { setLoading(false) }
  }

  async function createUnit() {
    if (!unitName.trim()) { setError('Nome da unidade é obrigatório'); return }
    setLoading(true); setError('')
    try {
      const res = await api.post<{ id: string }>('/api/admin/units', { name: unitName.trim(), address: unitAddress || undefined })
      setUnitId(res.id)
      setStep('dentist')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar unidade')
    } finally { setLoading(false) }
  }

  async function createDentist() {
    if (!dentName.trim() || !dentExtId.trim()) { setError('Nome e ID externo são obrigatórios'); return }
    setLoading(true); setError('')
    try {
      await api.post('/api/admin/dentists', {
        name:        dentName.trim(),
        external_id: dentExtId.trim(),
        unit_id:     unitId,
        cro:         dentCro || undefined,
        specialty:   dentSpecialty.split(',').map(s => s.trim()).filter(Boolean),
        color:       dentColor,
      })
      setStep('procedure')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar dentista')
    } finally { setLoading(false) }
  }

  async function createProcedure() {
    if (!procName.trim()) { setError('Nome do procedimento é obrigatório'); return }
    setLoading(true); setError('')
    try {
      await api.post('/api/admin/procedures', { name: procName.trim(), duration_minutes: procDuration, color: procColor })
      setStep('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar procedimento')
    } finally { setLoading(false) }
  }

  function goToAgenda() {
    router.push(`/${accountId}?userId=${adminExtId}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-rose-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Escala Agenda</h1>
          <p className="text-sm text-gray-500 mt-1">Configure sua clínica em minutos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {step !== 'done' && <StepIndicator current={step} />}

          {/* ── Step: account ── */}
          {step === 'account' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Dados da clínica</h2>
                <p className="text-xs text-gray-400 mt-0.5">Estas informações identificam sua conta na plataforma.</p>
              </div>
              <Field label="Nome da clínica *">
                <input className={inputCls} value={accName} onChange={e => { setAccName(e.target.value); if (!accSlug) {} }} placeholder="Ex: Clínica OdontoSaúde" />
              </Field>
              <Field label="Slug (URL)" hint="Gerado automaticamente. Use apenas letras, números e hífens.">
                <input className={inputCls} value={accSlug || slugify(accName)} onChange={e => setAccSlug(e.target.value)} placeholder="clinica-odontosaude" />
              </Field>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Administrador inicial</p>
                <div className="space-y-3">
                  <Field label="Nome do administrador *">
                    <input className={inputCls} value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Nome completo" />
                  </Field>
                  <Field label="ID externo *" hint="Identificador único do admin no seu sistema (ex: ID do CRM, e-mail, CPF).">
                    <input className={inputCls} value={adminExtId} onChange={e => setAdminExtId(e.target.value)} placeholder="Ex: admin@clinica.com" />
                  </Field>
                </div>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button onClick={createAccount} disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {loading ? 'Criando conta...' : 'Criar conta e continuar'}
              </button>
            </div>
          )}

          {/* ── Step: unit ── */}
          {step === 'unit' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Primeira unidade</h2>
                <p className="text-xs text-gray-400 mt-0.5">A unidade é o local físico da clínica. Você pode adicionar mais depois.</p>
              </div>
              <Field label="Nome da unidade *">
                <input className={inputCls} value={unitName} onChange={e => setUnitName(e.target.value)} placeholder="Ex: Unidade Centro" />
              </Field>
              <Field label="Endereço">
                <input className={inputCls} value={unitAddress} onChange={e => setUnitAddress(e.target.value)} placeholder="Rua, número, bairro, cidade" />
              </Field>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button onClick={createUnit} disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {loading ? 'Criando...' : 'Continuar'}
              </button>
            </div>
          )}

          {/* ── Step: dentist ── */}
          {step === 'dentist' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Primeiro profissional</h2>
                <p className="text-xs text-gray-400 mt-0.5">Adicione o primeiro dentista. Você pode pular e configurar depois.</p>
              </div>
              <Field label="Nome completo *">
                <input className={inputCls} value={dentName} onChange={e => setDentName(e.target.value)} placeholder="Dr. Nome Sobrenome" />
              </Field>
              <Field label="ID externo *" hint="Usado para login via URL. Deve ser único na conta.">
                <input className={inputCls} value={dentExtId} onChange={e => setDentExtId(e.target.value)} placeholder="Ex: dr.carlos" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="CRO"><input className={inputCls} value={dentCro} onChange={e => setDentCro(e.target.value)} placeholder="CRO/SP 00000" /></Field>
                <Field label="Especialidades"><input className={inputCls} value={dentSpecialty} onChange={e => setDentSpecialty(e.target.value)} placeholder="Ortodontia, ..." /></Field>
              </div>
              <Field label="Cor na agenda">
                <div className="flex flex-wrap gap-2 mt-1">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setDentColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${dentColor === c ? 'scale-125 ring-2 ring-offset-1 ring-violet-400' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </Field>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setStep('procedure')}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                  Pular
                </button>
                <button onClick={createDentist} disabled={loading}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {loading ? 'Criando...' : 'Continuar'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step: procedure ── */}
          {step === 'procedure' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Primeiro procedimento</h2>
                <p className="text-xs text-gray-400 mt-0.5">Ex: Limpeza, Consulta, Extração. Você pode adicionar mais depois.</p>
              </div>
              <Field label="Nome *">
                <input className={inputCls} value={procName} onChange={e => setProcName(e.target.value)} placeholder="Ex: Limpeza dental" />
              </Field>
              <Field label="Duração (minutos)">
                <input type="number" min={5} step={5} className={inputCls} value={procDuration} onChange={e => setProcDuration(Number(e.target.value))} />
              </Field>
              <Field label="Cor">
                <div className="flex flex-wrap gap-2 mt-1">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setProcColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${procColor === c ? 'scale-125 ring-2 ring-offset-1 ring-violet-400' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </Field>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setStep('done')}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                  Pular
                </button>
                <button onClick={createProcedure} disabled={loading}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {loading ? 'Criando...' : 'Concluir setup'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-3xl">✓</div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Tudo pronto!</h2>
                <p className="text-sm text-gray-500 mt-2">Sua clínica está configurada na Escala Agenda.<br/>Acesse a agenda e comece a trabalhar.</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Próximos passos</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Configure os horários de trabalho dos dentistas (Configurações → Profissionais)</li>
                  <li>• Crie as cadeiras/consultórios (Configurações → Cadeiras)</li>
                  <li>• Gere uma API Key para conectar o agente de IA (Configurações → API Keys)</li>
                </ul>
              </div>
              <button onClick={goToAgenda}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 transition-opacity">
                Ir para a agenda
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">Escala Agenda · Plataforma white label</p>
      </div>
    </div>
  )
}
