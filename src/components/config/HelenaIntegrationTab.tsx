'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Option   = { id: string; name: string }
type Channel  = { id: string; name: string; phone: string }
type PanelStep = { id: string; name: string }

type IntegrationConfig = {
  helena_enabled:       boolean
  helena_token_set:     boolean
  helena_channel:       string | null
  confirm_template_id:  string | null
  reminder_template_id: string | null
  reminder_lead_hours:  number
  sync_contacts:        boolean
  tag_scheduled:        string | null
  tag_completed:        string | null
  tag_no_show:          string | null
  panel_id:             string | null
  step_mappings:        Record<string, string>
}

// As 9 etapas do funil Helena — na ordem exata do GUIA-KANBAN-HELENA.md
const FUNIL_STAGES = [
  { key: 'lead',              label: 'Leads' },
  { key: 'not_scheduled',     label: 'Não Agendado' },
  { key: 'scheduled',         label: 'Agendados' },
  { key: 'rescheduled',       label: 'Reagendado' },
  { key: 'cancelled',         label: 'Cancelou' },
  { key: 'no_show',           label: 'Faltou' },
  { key: 'attended',          label: 'Comparecido' },
  { key: 'attended_no_close', label: 'Compareceu e Não Fechou' },
  { key: 'attended_closed',   label: 'Compareceu e Fechou' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-border bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-brand-solid' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function OptionSelect({
  value, onChange, options, emptyLabel,
}: { value: string; onChange: (v: string) => void; options: Option[]; emptyLabel: string }) {
  return (
    <select className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      {value && !options.some(o => o.id === value) && <option value={value}>(selecionado anteriormente)</option>}
    </select>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HelenaIntegrationTab() {
  // Config básica
  const [loading, setLoading]           = useState(true)
  const [enabled, setEnabled]           = useState(false)
  const [tokenSet, setTokenSet]         = useState(false)
  const [tokenInput, setTokenInput]     = useState('')
  const [channel, setChannel]           = useState('')
  const [tagScheduled, setTagScheduled] = useState('')
  const [tagCompleted, setTagCompleted] = useState('')
  const [tagNoShow, setTagNoShow]       = useState('')
  const [confirmTpl, setConfirmTpl]     = useState('')
  const [reminderTpl, setReminderTpl]   = useState('')
  const [leadHours, setLeadHours]       = useState(24)
  const [syncContacts, setSyncContacts] = useState(true)

  // Painel + mapeamento de etapas
  const [panelId, setPanelId]               = useState('')
  const [stepMappings, setStepMappings]     = useState<Record<string, string>>({})
  const [panels, setPanels]                 = useState<Option[]>([])
  const [panelSteps, setPanelSteps]         = useState<PanelStep[]>([])
  const [stepsLoading, setStepsLoading]     = useState(false)

  // Listas Helena (pós-conexão)
  const [channels, setChannels]     = useState<Channel[]>([])
  const [tags, setTags]             = useState<Option[]>([])
  const [templates, setTemplates]   = useState<Option[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError]   = useState('')
  const [connected, setConnected]   = useState(false)

  // Feedback
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  // Carrega listas Helena (canais, etiquetas, templates) + painéis
  const loadLists = useCallback(async () => {
    setListLoading(true); setListError('')
    try {
      const [ch, tg, tp, pn] = await Promise.all([
        api.get<{ data: Channel[] }>('/api/admin/integrations/channels'),
        api.get<{ data: Option[] }>('/api/admin/integrations/tags'),
        api.get<{ data: Option[] }>('/api/admin/integrations/templates'),
        api.get<{ data: Option[] }>('/api/admin/integrations/helena/panels'),
      ])
      setChannels(ch.data ?? [])
      setTags(tg.data ?? [])
      setTemplates(tp.data ?? [])
      setPanels(pn.data ?? [])
      setConnected(true)
    } catch (e) {
      setConnected(false)
      setListError(e instanceof Error ? e.message : 'Não consegui conectar na Helena')
    } finally { setListLoading(false) }
  }, [])

  // Carrega etapas do painel selecionado
  const loadSteps = useCallback(async (pid: string) => {
    if (!pid) { setPanelSteps([]); return }
    setStepsLoading(true)
    try {
      const res = await api.get<{ data: PanelStep[] }>(`/api/admin/integrations/helena/steps?panelId=${pid}`)
      setPanelSteps(res.data ?? [])
    } catch {
      setPanelSteps([])
    } finally { setStepsLoading(false) }
  }, [])

  // Carrega config salva no banco
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const c = await api.get<IntegrationConfig>('/api/admin/integrations')
      setEnabled(c.helena_enabled)
      setTokenSet(c.helena_token_set)
      setChannel(c.helena_channel ?? '')
      setTagScheduled(c.tag_scheduled ?? '')
      setTagCompleted(c.tag_completed ?? '')
      setTagNoShow(c.tag_no_show ?? '')
      setConfirmTpl(c.confirm_template_id ?? '')
      setReminderTpl(c.reminder_template_id ?? '')
      setLeadHours(c.reminder_lead_hours ?? 24)
      setSyncContacts(c.sync_contacts)
      setPanelId(c.panel_id ?? '')
      setStepMappings(c.step_mappings ?? {})
      if (c.helena_token_set) {
        await loadLists()
        if (c.panel_id) await loadSteps(c.panel_id)
      }
    } catch {} finally { setLoading(false) }
  }, [loadLists, loadSteps])

  useEffect(() => { load() }, [load])

  // Ao mudar painel: carrega etapas e limpa mapeamentos antigos
  async function handlePanelChange(pid: string) {
    setPanelId(pid)
    setStepMappings({})
    await loadSteps(pid)
  }

  // Salva token e conecta
  async function connect() {
    setError('')
    try {
      if (tokenInput.trim()) {
        await api.put('/api/admin/integrations', { helena_token: tokenInput.trim() })
        setTokenSet(true)
        setTokenInput('')
      }
      await loadLists()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao conectar')
    }
  }

  // Salva toda a configuração incluindo panel_id e step_mappings
  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const payload: Record<string, unknown> = {
        helena_enabled:       enabled,
        helena_channel:       channel || null,
        confirm_template_id:  confirmTpl || null,
        reminder_template_id: reminderTpl || null,
        reminder_lead_hours:  leadHours,
        sync_contacts:        syncContacts,
        tag_scheduled:        tagScheduled || null,
        tag_completed:        tagCompleted || null,
        tag_no_show:          tagNoShow || null,
        panel_id:             panelId || null,
        step_mappings:        stepMappings,
      }
      if (tokenInput.trim()) payload.helena_token = tokenInput.trim()
      await api.put('/api/admin/integrations', payload)
      if (tokenInput.trim()) { setTokenSet(true); setTokenInput('') }
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const channelOptions: Option[] = channels
    .map(c => ({ id: c.phone, name: c.phone ? `${c.name} — ${c.phone}` : c.name }))
    .filter(o => o.id)

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Carregando...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-gray-900">Integração Helena (WhatsApp)</h2>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl px-5 py-5 space-y-5">

        {/* Toggle ativo + token */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Integração ativa</p>
            <p className="text-[11px] text-gray-400">Liga o envio de mensagens e a sincronização com a Helena.</p>
          </div>
          <Toggle value={enabled} onChange={setEnabled} />
        </div>

        <Field label="Token da API">
          <div className="flex gap-2">
            <input
              type="password"
              className={`${inputCls} flex-1`}
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder={tokenSet ? '•••••••• (configurado — digite para trocar)' : 'Cole o token da Helena'}
            />
            <button
              type="button"
              onClick={connect}
              disabled={listLoading || (!tokenSet && !tokenInput.trim())}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-solid text-white hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap"
            >
              {listLoading ? 'Conectando...' : connected ? 'Recarregar' : 'Conectar'}
            </button>
          </div>
          {listError && <p className="text-xs text-red-500 mt-2">{listError}</p>}
          {connected && !listError && <p className="text-xs text-emerald-600 mt-2">✓ Conectado à Helena</p>}
        </Field>

        {!connected && (
          <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-4">
            Cole o token e clique em <strong>Conectar</strong> para carregar canais, etiquetas, templates e painéis da sua conta Helena.
          </p>
        )}

        {connected && (
          <>
            {/* Canal de envio */}
            <Field label="Canal de envio (WhatsApp)">
              <OptionSelect value={channel} onChange={setChannel} options={channelOptions} emptyLabel="— selecione o canal —" />
            </Field>

            {/* Sincronização */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Sincronização</p>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700">Espelhar pacientes como contatos da Helena</p>
                <Toggle value={syncContacts} onChange={setSyncContacts} />
              </div>
            </div>

            {/* Etiquetas por status */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Etiquetas por status</p>
              <Field label="Ao agendar"><OptionSelect value={tagScheduled} onChange={setTagScheduled} options={tags} emptyLabel="— nenhuma —" /></Field>
              <Field label="Ao concluir"><OptionSelect value={tagCompleted} onChange={setTagCompleted} options={tags} emptyLabel="— nenhuma —" /></Field>
              <Field label="Em falta (no-show)"><OptionSelect value={tagNoShow} onChange={setTagNoShow} options={tags} emptyLabel="— nenhuma —" /></Field>
            </div>

            {/* Mensagens automáticas */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Mensagens automáticas</p>
              {templates.length === 0 && (
                <p className="text-[11px] text-amber-600">Nenhum template aprovado encontrado nesta conta Helena.</p>
              )}
              <Field label="Confirmação (enviada na hora)"><OptionSelect value={confirmTpl} onChange={setConfirmTpl} options={templates} emptyLabel="— não enviar —" /></Field>
              <Field label="Lembrete (agendado)"><OptionSelect value={reminderTpl} onChange={setReminderTpl} options={templates} emptyLabel="— não enviar —" /></Field>
              <Field label="Antecedência do lembrete (horas)">
                <input type="number" min={0} max={720} className={inputCls} value={leadHours} onChange={e => setLeadHours(Number(e.target.value))} />
              </Field>
            </div>

            {/* Painel CRM + mapeamento das 9 etapas */}
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">Kanban CRM</p>
                <Field label="Painel Helena">
                  <OptionSelect
                    value={panelId}
                    onChange={handlePanelChange}
                    options={panels}
                    emptyLabel="— selecione o painel —"
                  />
                </Field>
              </div>

              {panelId && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">
                    Mapeamento das etapas do funil → etapas do painel Helena
                  </p>
                  <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                    Para cada status do seu sistema, escolha a etapa correspondente no painel Helena selecionado.
                  </p>

                  {stepsLoading ? (
                    <p className="text-[11px] text-gray-400">Carregando etapas do painel...</p>
                  ) : panelSteps.length === 0 ? (
                    <p className="text-[11px] text-amber-600">Não foi possível carregar as etapas deste painel.</p>
                  ) : (
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-1/2">
                              Status no sistema
                            </th>
                            <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-1/2">
                              Etapa na Helena
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {FUNIL_STAGES.map((stage, i) => (
                            <tr key={stage.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                              <td className="px-4 py-2.5 text-gray-700 font-medium text-xs">
                                {stage.label}
                              </td>
                              <td className="px-4 py-2.5">
                                <select
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-border bg-white"
                                  value={stepMappings[stage.key] ?? ''}
                                  onChange={e =>
                                    setStepMappings(prev => ({
                                      ...prev,
                                      [stage.key]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">— não mapear —</option>
                                  {panelSteps.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-solid text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving ? 'Salvando...' : 'Salvar configuração'}
          </button>
          {saved && <span className="text-xs font-medium text-emerald-600">✓ Salvo</span>}
        </div>
      </div>
    </div>
  )
}
