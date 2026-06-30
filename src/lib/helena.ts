import { supabaseAdmin } from '@/lib/supabase'

const BASE_URL = process.env.HELENA_BASE_URL ?? 'https://api.wts.chat'
const FLUXODONTO_URL = process.env.FLUXODONTO_URL ?? 'https://app.fluxodonto.com'

// Config de integração Helena de UMA conta (white-label: uma Helena por clínica).
export type AccountIntegration = {
  account_id:           string
  helena_enabled:       boolean
  helena_token:         string | null
  helena_channel:       string | null
  confirm_template_id:  string | null
  reminder_template_id: string | null
  reminder_lead_hours:  number
  sync_contacts:        boolean
  tag_scheduled:        string | null
  tag_completed:        string | null
  tag_no_show:          string | null
  panel_id:             string | null
}

// Carrega a config da conta. Retorna null quando a integração não está
// habilitada ou não há token — assim os chamadores tratam Helena como
// best-effort e simplesmente não fazem nada quando a conta não configurou.
export async function getAccountIntegration(accountId: string): Promise<AccountIntegration | null> {
  // account_integrations ainda não está nos tipos gerados (migration 0005).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin as any)
    .from('account_integrations')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (!data || !data.helena_enabled || !data.helena_token) return null
  return data as AccountIntegration
}

export async function getHelenaTokenForAccount(accountId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin as any)
    .from('account_integrations')
    .select('helena_token')
    .eq('account_id', accountId)
    .maybeSingle()
  return data?.helena_token ?? null
}

// Backoff em 429: a Helena limita por conta (1000/5min + 200/5s burst). Respeita
// o header Retry-After quando presente; senão espera incremental. Até 3 tentativas.
async function helenaFetch(token: string, path: string, options: RequestInit = {}) {
  const maxRetries = 3
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : (attempt + 1) * 1000
      await new Promise(resolve => setTimeout(resolve, waitMs))
      continue
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Helena API error ${res.status}: ${text}`)
    }

    // Alguns endpoints respondem corpo vazio.
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
}

// ─── Chat / Contact API ───────────────────────────────────────────────────────

// Busca contato pelo telefone — retorna o id do contato ou null
export async function getContactByPhone(token: string, phone: string): Promise<string | null> {
  try {
    const clean = phone.replace(/\D/g, '')
    const data = await helenaFetch(token, `/core/v1/contact/phonenumber/${clean}`)
    return data?.id ?? null
  } catch {
    return null
  }
}

// Busca a sessão ativa mais recente de um contato — retorna o session id ou null
export async function getActiveSessionByContactId(token: string, contactId: string): Promise<string | null> {
  try {
    const data = await helenaFetch(
      token,
      `/chat/v2/session?ContactId=${contactId}&Status=OPEN&PageSize=1&OrderBy=LastInteractionAt&OrderDirection=DESCENDING`
    )
    return data?.items?.[0]?.id ?? null
  } catch {
    return null
  }
}

export function buildSessionUrl(sessionId: string): string {
  return `${FLUXODONTO_URL}/chat2/sessions/${sessionId}`
}

export function sendText(token: string, to: string, from: string, text: string) {
  return helenaFetch(token, '/chat/v1/send/text', {
    method: 'POST',
    body: JSON.stringify({ to, from, text }),
  })
}

export function sendSessionMessage(token: string, sessionId: string, text: string) {
  return helenaFetch(token, `/chat/v1/session/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function transferToTeam(token: string, sessionId: string, departmentId: string) {
  return helenaFetch(token, `/chat/v1/session/${sessionId}/transfer`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'DEPARTMENT', newDepartmentId: departmentId }),
  })
}

export function completeSession(token: string, sessionId: string, reactivateOnNewMessage = true) {
  return helenaFetch(token, `/chat/v1/session/${sessionId}/complete`, {
    method: 'PUT',
    body: JSON.stringify({ reactivateOnNewMessage }),
  })
}

// Cria ou atualiza um contato pelo telefone (upsert determinístico: consulta
// se já existe → PUT por telefone; senão → POST cria).
export async function upsertContact(
  token: string,
  contact: { phone: string; name?: string | null; email?: string | null },
) {
  const clean = contact.phone.replace(/\D/g, '')
  const body = {
    name:  contact.name ?? undefined,
    email: contact.email ?? undefined,
  }
  const existing = await getContactByPhone(token, clean)
  if (existing) {
    return helenaFetch(token, `/core/v1/contact/phonenumber/${clean}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }
  return helenaFetch(token, '/core/v1/contact', {
    method: 'POST',
    body: JSON.stringify({ ...body, phoneNumber: clean }),
  })
}

// Best-effort: sincroniza o paciente como contato na Helena. NUNCA lança — uma
// falha de integração não pode quebrar o cadastro/edição do paciente.
export async function syncPatientContact(
  accountId: string,
  patient: { phone?: string | null; name?: string | null; email?: string | null },
): Promise<void> {
  try {
    if (!patient.phone) return
    const integ = await getAccountIntegration(accountId)
    if (!integ || !integ.sync_contacts) return
    await upsertContact(integ.helena_token!, { phone: patient.phone, name: patient.name, email: patient.email })
  } catch (e) {
    console.error('[helena] syncPatientContact falhou:', e instanceof Error ? e.message : e)
  }
}

export function setContactTags(
  token: string,
  phone: string,
  tagIds: string[],
  operation: 'InsertIfNotExists' | 'DeleteIfExists' | 'ReplaceAll' = 'InsertIfNotExists',
) {
  const clean = phone.replace(/\D/g, '')
  return helenaFetch(token, `/core/v1/contact/phonenumber/${clean}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagIds, operation }),
  })
}

const STATUS_TAG_FIELD: Partial<Record<string, 'tag_scheduled' | 'tag_completed' | 'tag_no_show'>> = {
  scheduled: 'tag_scheduled',
  completed: 'tag_completed',
  no_show:   'tag_no_show',
}

export async function tagContactByStatus(
  accountId: string,
  phone: string | null | undefined,
  status: string,
): Promise<void> {
  try {
    if (!phone) return
    const field = STATUS_TAG_FIELD[status]
    if (!field) return
    const integ = await getAccountIntegration(accountId)
    if (!integ) return
    const tag = integ[field]
    if (!tag) return
    await setContactTags(integ.helena_token!, phone, [tag], 'InsertIfNotExists')
  } catch (e) {
    console.error('[helena] tagContactByStatus falhou:', e instanceof Error ? e.message : e)
  }
}

// ─── Templates / lembrete ────────────────────────────────────────────────────

export type AppointmentNotifyInfo = {
  phone:          string | null | undefined
  startAtISO:     string
  patientName?:   string | null
  dentistName?:   string | null
  procedureName?: string | null
}

function buildAppointmentParams(info: AppointmentNotifyInfo): Record<string, string> {
  const start = new Date(info.startAtISO)
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...opts }).format(start)
  return {
    nome:         info.patientName ?? '',
    data:         fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora:         fmt({ hour: '2-digit', minute: '2-digit' }),
    profissional: info.dentistName ?? '',
    procedimento: info.procedureName ?? '',
  }
}

export function sendTemplate(
  token: string,
  args: { to: string; from: string; templateId: string; parameters?: Record<string, string> },
) {
  return helenaFetch(token, '/chat/v1/send/template', {
    method: 'POST',
    body: JSON.stringify({
      to: args.to.replace(/\D/g, ''), from: args.from,
      templateId: args.templateId, parameters: args.parameters,
    }),
  })
}

export async function scheduleTemplate(
  token: string,
  args: {
    to: string; from: string; templateId: string
    scheduling: string; templateParams?: Record<string, string>
  },
): Promise<string | null> {
  const data = await helenaFetch(token, '/chat/v1/scheduled-message', {
    method: 'POST',
    body: JSON.stringify({
      to: args.to.replace(/\D/g, ''), from: args.from, type: 'TEMPLATE',
      templateId: args.templateId, scheduling: args.scheduling, templateParams: args.templateParams,
    }),
  })
  return data?.id ?? null
}

export function cancelScheduledMessage(token: string, id: string) {
  return helenaFetch(token, `/chat/v1/scheduled-message/${id}/cancel`, { method: 'POST' })
}

export async function notifyAppointmentBooked(
  accountId: string,
  info: AppointmentNotifyInfo,
): Promise<string | null> {
  try {
    if (!info.phone) return null
    const integ = await getAccountIntegration(accountId)
    if (!integ || !integ.helena_channel) return null
    const token = integ.helena_token!
    const params = buildAppointmentParams(info)
    if (integ.tag_scheduled) {
      await setContactTags(token, info.phone, [integ.tag_scheduled], 'InsertIfNotExists').catch(() => {})
    }
    if (integ.confirm_template_id) {
      await sendTemplate(token, {
        to: info.phone, from: integ.helena_channel,
        templateId: integ.confirm_template_id, parameters: params,
      }).catch(e => console.error('[helena] confirmação falhou:', e instanceof Error ? e.message : e))
    }
    if (integ.reminder_template_id) {
      const remindAt = new Date(new Date(info.startAtISO).getTime() - integ.reminder_lead_hours * 3_600_000)
      if (remindAt.getTime() > Date.now()) {
        return await scheduleTemplate(token, {
          to: info.phone, from: integ.helena_channel, templateId: integ.reminder_template_id,
          scheduling: remindAt.toISOString(), templateParams: params,
        })
      }
    }
    return null
  } catch (e) {
    console.error('[helena] notifyAppointmentBooked falhou:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function rescheduleReminder(
  accountId: string,
  oldReminderId: string | null | undefined,
  info: AppointmentNotifyInfo,
): Promise<string | null> {
  try {
    const integ = await getAccountIntegration(accountId)
    if (!integ) return null
    if (oldReminderId) {
      await cancelScheduledMessage(integ.helena_token!, oldReminderId).catch(() => {})
    }
    if (!integ.helena_channel || !integ.reminder_template_id || !info.phone) return null
    const remindAt = new Date(new Date(info.startAtISO).getTime() - integ.reminder_lead_hours * 3_600_000)
    if (remindAt.getTime() <= Date.now()) return null
    return await scheduleTemplate(integ.helena_token!, {
      to: info.phone, from: integ.helena_channel, templateId: integ.reminder_template_id,
      scheduling: remindAt.toISOString(), templateParams: buildAppointmentParams(info),
    })
  } catch (e) {
    console.error('[helena] rescheduleReminder falhou:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function cancelReminder(
  accountId: string,
  reminderMessageId: string | null | undefined,
): Promise<void> {
  try {
    if (!reminderMessageId) return
    const integ = await getAccountIntegration(accountId)
    if (!integ) return
    await cancelScheduledMessage(integ.helena_token!, reminderMessageId)
  } catch (e) {
    console.error('[helena] cancelReminder falhou:', e instanceof Error ? e.message : e)
  }
}

// ─── Listas para tela de configuração ────────────────────────────────────────

export type HelenaOption  = { id: string; name: string }
export type HelenaChannel = { id: string; name: string; phone: string }

type RawRow = Record<string, unknown>
function normalizeList(data: unknown): RawRow[] {
  if (Array.isArray(data)) return data as RawRow[]
  const obj = data as RawRow | null
  if (obj && Array.isArray(obj.items)) return obj.items as RawRow[]
  if (obj && Array.isArray(obj.data))  return obj.data  as RawRow[]
  return []
}
const asStr = (v: unknown): string | undefined => (v == null ? undefined : String(v))

export async function listTags(token: string): Promise<HelenaOption[]> {
  const rows = normalizeList(await helenaFetch(token, '/core/v1/tag'))
  return rows
    .map(t => ({ id: asStr(t.id) ?? '', name: asStr(t.name) ?? asStr(t.title) ?? asStr(t.id) ?? '' }))
    .filter(t => t.id)
}

export async function listTemplates(token: string): Promise<HelenaOption[]> {
  const rows = normalizeList(await helenaFetch(token, '/chat/v1/template?ApprovedOnly=true&PageSize=100'))
  return rows
    .map(t => ({
      id:   asStr(t.id) ?? '',
      name: asStr(t.name) ?? asStr(t.friendlyName) ?? asStr(t.title) ?? asStr(t.id) ?? '',
    }))
    .filter(t => t.id)
}

export async function listChannels(token: string): Promise<HelenaChannel[]> {
  const rows = normalizeList(await helenaFetch(token, '/chat/v1/channel?ChannelType=Whatsapp'))
  return rows
    .map(c => {
      const phone = asStr(c.phone) ?? asStr(c.phoneNumber) ?? asStr(c.number) ?? ''
      return {
        id:    asStr(c.id) ?? '',
        name:  asStr(c.name) ?? asStr(c.friendlyName) ?? phone ?? asStr(c.id) ?? '',
        phone,
      }
    })
    .filter(c => c.id)
}

// ─── CRM Types (TASK-010) ─────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items:        T[]
  totalItems:   number
  totalPages:   number
  hasMorePages: boolean
  pageNumber:   number
  pageSize:     number
}

export interface Panel {
  id:               string
  title:            string
  description:      string | null
  key:              string
  archived:         boolean
  scope:            'COMPANY' | 'USER'
  type:             'MANAGEMENT' | string
  overdueCardCount: number
  createdAt:        string
  updatedAt:        string
}

export interface PanelCard {
  id:          string
  title:       string
  description: string | null
  stepId:      string | null
  stepTitle:   string | null
  panelId:     string
  tagIds:      string[] | null
  contactId:   string | null
  createdAt:   string
  updatedAt:   string
}

export interface CardNote {
  id:        string
  cardId:    string
  panelId:   string
  userId:    string
  text:      string
  createdAt: string
  updatedAt: string
}

export interface MoveCardInput {
  stepId?:      string
  /** Sempre enviar a description atual completa — Helena substitui com vazio se omitida. */
  description?: string
  /** Helena faz MERGE de tags — nunca substitui. Passe só os IDs a adicionar. */
  tagIds?:      string[]
}

// ─── CRM / Panel API (TASK-010) ───────────────────────────────────────────────

export function listPanels(token: string): Promise<PaginatedResponse<Panel>> {
  return helenaFetch(token, '/crm/v2/panel')
}

export function getPanel(id: string, token: string): Promise<Panel> {
  return helenaFetch(token, `/crm/v1/panel/${id}`)
}

export function listPanelCards(
  panelId: string,
  token: string,
  page = 1,
  pageSize = 100,
): Promise<PaginatedResponse<PanelCard>> {
  return helenaFetch(token, `/crm/v1/panel/card?PanelId=${panelId}&Page=${page}&PageSize=${pageSize}`)
}

export async function getCardByContact(
  panelId: string,
  contactId: string,
  token: string,
): Promise<PanelCard | null> {
  const data: PaginatedResponse<PanelCard> = await helenaFetch(
    token,
    `/crm/v1/panel/card?PanelId=${panelId}&ContactId=${contactId}&PageSize=1`,
  )
  return data.items[0] ?? null
}

// fields[] indica à Helena quais campos atualizar — apenas os que foram passados.
// PUT /crm/v2/panel/card/{id} retorna o card completo atualizado.
export function moveCard(
  cardId: string,
  updates: MoveCardInput,
  token: string,
): Promise<PanelCard> {
  const fields: string[] = []
  if (updates.stepId !== undefined)      fields.push('StepId')
  if (updates.description !== undefined) fields.push('Description')
  if (updates.tagIds !== undefined)      fields.push('TagIds')

  return helenaFetch(token, `/crm/v2/panel/card/${cardId}`, {
    method: 'PUT',
    body: JSON.stringify({ fields, ...updates }),
  })
}

export function getCardNotes(
  cardId: string,
  token: string,
): Promise<PaginatedResponse<CardNote>> {
  return helenaFetch(token, `/crm/v1/panel/card/${cardId}/note`)
}

export function createCardNote(
  cardId: string,
  text: string,
  token: string,
): Promise<CardNote> {
  return helenaFetch(token, `/crm/v1/panel/card/${cardId}/note`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export { helenaFetch }
