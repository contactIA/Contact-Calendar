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

// Monta a URL de atendimento no Fluxodonto
export function buildSessionUrl(sessionId: string): string {
  return `${FLUXODONTO_URL}/chat2/sessions/${sessionId}`
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
    await upsertContact(integ.helena_token!, {
      phone: patient.phone,
      name:  patient.name,
      email: patient.email,
    })
  } catch (e) {
    console.error('[helena] syncPatientContact falhou:', e instanceof Error ? e.message : e)
  }
}

// Gerencia etiquetas de um contato pelo telefone. operation:
// InsertIfNotExists (adiciona), DeleteIfExists (remove) ou ReplaceAll (substitui).
export function setContactTags(
  token: string,
  phone: string,
  tagNames: string[],
  operation: 'InsertIfNotExists' | 'DeleteIfExists' | 'ReplaceAll' = 'InsertIfNotExists',
) {
  const clean = phone.replace(/\D/g, '')
  return helenaFetch(token, `/core/v1/contact/phonenumber/${clean}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagNames, operation }),
  })
}

// Mapeia o status do agendamento para o campo de etiqueta configurado na conta.
const STATUS_TAG_FIELD: Partial<Record<string, 'tag_scheduled' | 'tag_completed' | 'tag_no_show'>> = {
  scheduled: 'tag_scheduled',
  completed: 'tag_completed',
  no_show:   'tag_no_show',
}

// Best-effort: aplica a etiqueta correspondente ao status no contato do paciente.
// NUNCA lança — falha na Helena não pode quebrar a mudança de status.
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

// --- Templates / lembrete ---------------------------------------------------

// Dados da consulta usados para preencher o template e decidir o lembrete.
export type AppointmentNotifyInfo = {
  phone:          string | null | undefined
  startAtISO:     string
  patientName?:   string | null
  dentistName?:   string | null
  procedureName?: string | null
}

// Monta os parâmetros do template a partir da consulta.
// ATENÇÃO: as chaves abaixo precisam casar com as variáveis do template
// APROVADO no canal da clínica — isso varia por template e deve ser calibrado
// com um template real. Como o envio é best-effort, um formato incompatível
// apenas falha e loga, sem afetar o agendamento.
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

// Envia um template imediatamente para um contato.
export function sendTemplate(
  token: string,
  args: { to: string; from: string; templateId: string; parameters?: Record<string, string> },
) {
  return helenaFetch(token, '/chat/v1/send/template', {
    method: 'POST',
    body: JSON.stringify({
      to:         args.to.replace(/\D/g, ''),
      from:       args.from,
      templateId: args.templateId,
      parameters: args.parameters,
    }),
  })
}

// Agenda um template para uma data/hora. Retorna o id da mensagem agendada.
export async function scheduleTemplate(
  token: string,
  args: { to: string; from: string; templateId: string; scheduling: string; templateParams?: Record<string, string> },
): Promise<string | null> {
  const data = await helenaFetch(token, '/chat/v1/scheduled-message', {
    method: 'POST',
    body: JSON.stringify({
      to:             args.to.replace(/\D/g, ''),
      from:           args.from,
      type:           'TEMPLATE',
      templateId:     args.templateId,
      scheduling:     args.scheduling,
      templateParams: args.templateParams,
    }),
  })
  return data?.id ?? null
}

// Cancela uma mensagem agendada (só funciona enquanto ela está "agendada").
export function cancelScheduledMessage(token: string, id: string) {
  return helenaFetch(token, `/chat/v1/scheduled-message/${id}/cancel`, { method: 'POST' })
}

// Best-effort: ao criar a consulta, etiqueta como agendada, envia a confirmação
// imediata e agenda o lembrete. Retorna o id do lembrete (para guardar no
// agendamento e poder cancelar depois) ou null. NUNCA lança.
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
        to: info.phone, from: integ.helena_channel, templateId: integ.confirm_template_id, parameters: params,
      }).catch(e => console.error('[helena] confirmação falhou:', e instanceof Error ? e.message : e))
    }

    if (integ.reminder_template_id) {
      const remindAt = new Date(new Date(info.startAtISO).getTime() - integ.reminder_lead_hours * 3_600_000)
      // Só agenda se o lembrete cair no futuro (consulta marcada com antecedência).
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

// Best-effort: ao remarcar, cancela o lembrete antigo e agenda um novo para o
// novo horário. Retorna o id do novo lembrete (ou null). NUNCA lança.
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

// Best-effort: cancela o lembrete agendado (ao cancelar a consulta). NUNCA lança.
export async function cancelReminder(accountId: string, reminderMessageId: string | null | undefined): Promise<void> {
  try {
    if (!reminderMessageId) return
    const integ = await getAccountIntegration(accountId)
    if (!integ) return
    await cancelScheduledMessage(integ.helena_token!, reminderMessageId)
  } catch (e) {
    console.error('[helena] cancelReminder falhou:', e instanceof Error ? e.message : e)
  }
}

// Exporta o fetch para os módulos de feature (contato, etiquetas, templates).
export { helenaFetch }
