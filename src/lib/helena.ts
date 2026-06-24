const BASE_URL = process.env.HELENA_BASE_URL ?? 'https://api.wts.chat'
const TOKEN = process.env.HELENA_API_TOKEN!
const FLUXODONTO_URL = process.env.FLUXODONTO_URL ?? 'https://app.fluxodonto.com'

async function helenaFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Helena API error ${res.status}: ${text}`)
  }
  return res.json()
}

// Busca contato pelo telefone — retorna o id do contato ou null
export async function getContactByPhone(phone: string): Promise<string | null> {
  try {
    const clean = phone.replace(/\D/g, '')
    const data = await helenaFetch(`/core/v1/contact/phonenumber/${clean}`)
    return data?.id ?? null
  } catch {
    return null
  }
}

// Busca a sessão ativa mais recente de um contato — retorna o session id ou null
export async function getActiveSessionByContactId(contactId: string): Promise<string | null> {
  try {
    const data = await helenaFetch(
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
