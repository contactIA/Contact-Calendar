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

// Exporta o fetch para os módulos de feature (contato, etiquetas, templates).
export { helenaFetch }
