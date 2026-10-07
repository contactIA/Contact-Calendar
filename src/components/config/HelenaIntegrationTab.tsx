'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Option   = { id: string; name: string }
type Channel  = { id: string; name: string; phone: string }

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
}

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

  // Carrega listas Helena (canais, etiquetas, templates)
  const loadLists = useCallback(async () => {
    setListLoading(true); setListError('')
    try {
      const [ch, tg, tp] = await Promise.all([
        api.get<{ data: Channel[] }>('/api/admin/integrations/channels'),
        api.get<{ data: Option[] }>('/api/admin/integrations/tags'),
        api.get<{ data: Option[] }>('/api/admin/integrations/templates'),
      ])
      setChannels(ch.data ?? [])
      setTags(tg.data ?? [])
      setTemplates(tp.data ?? [])
      setConnected(true)
    } catch (e) {
      setConnected(false)
      setListError(e instanceof Error ? e.message : 'Não consegui conectar na Helena')
    } finally { setListLoading(false) }
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
      if (c.helena_token_set) await loadLists()
    } catch {} finally { setLoading(false) }
  }, [loadLists])

  useEffect(() => { load() }, [load])

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

  // Salva toda a configuração
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
            Cole o token e clique em <strong>Conectar</strong> para carregar canais, etiquetas e templates da sua conta Helena.
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
