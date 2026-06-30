const BASE_URL = process.env.HELENA_BASE_URL ?? 'https://api.wts.chat'
const TOKEN = process.env.HELENA_API_TOKEN!
const FLUXODONTO_URL = process.env.FLUXODONTO_URL ?? 'https://app.fluxodonto.com'

// token param overrides the global TOKEN (CRM API uses a separate token)
async function helenaFetch(path: string, options: RequestInit = {}, token?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token ?? TOKEN}`,
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

// ─── Chat / Contact API ───────────────────────────────────────────────────────

export async function getContactByPhone(phone: string): Promise<string | null> {
  try {
    const clean = phone.replace(/\D/g, '')
    const data = await helenaFetch(`/core/v1/contact/phonenumber/${clean}`)
    return data?.id ?? null
  } catch {
    return null
  }
}

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

export function buildSessionUrl(sessionId: string): string {
  return `${FLUXODONTO_URL}/chat2/sessions/${sessionId}`
}

export function sendText(to: string, from: string, text: string) {
  return helenaFetch('/chat/v1/send/text', {
    method: 'POST',
    body: JSON.stringify({ to, from, text }),
  })
}

export function sendSessionMessage(sessionId: string, text: string) {
  return helenaFetch(`/chat/v1/session/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function transferToTeam(sessionId: string, departmentId: string) {
  return helenaFetch(`/chat/v1/session/${sessionId}/transfer`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'DEPARTMENT', newDepartmentId: departmentId }),
  })
}

export function completeSession(sessionId: string, reactivateOnNewMessage = true) {
  return helenaFetch(`/chat/v1/session/${sessionId}/complete`, {
    method: 'PUT',
    body: JSON.stringify({ reactivateOnNewMessage }),
  })
}

// ─── CRM Types ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  totalItems: number
  totalPages: number
  hasMorePages: boolean
  pageNumber: number
  pageSize: number
}

export interface Panel {
  id: string
  title: string
  description: string | null
  key: string
  archived: boolean
  scope: 'COMPANY' | 'USER'
  type: 'MANAGEMENT' | string
  overdueCardCount: number
  createdAt: string
  updatedAt: string
}

export interface PanelCard {
  id: string
  title: string
  description: string | null
  stepId: string | null
  panelId: string
  tagIds: string[] | null
  contactId: string | null
  createdAt: string
  updatedAt: string
}

export interface CardNote {
  id: string
  cardId: string
  panelId: string
  userId: string
  text: string
  createdAt: string
  updatedAt: string
}

export interface MoveCardInput {
  stepId?: string
  /** Always send the full current description to avoid overwriting with blank. */
  description?: string
  /** Helena merges tags — never replaces. Pass only the IDs you want to add. */
  tagIds?: string[]
}

// GET /v1/tag — endpoint retorna 400 com token CRM/integração padrão.
// A Helena exige parâmetros ou escopo de token não documentado.
// Os UUIDs conhecidos podem ser obtidos via tagIds dos cards (listPanelCards).
export interface Tag {
  id: string
  name: string
  color: string | null
  createdAt: string
}

// ─── CRM / Panel API ──────────────────────────────────────────────────────────

export function listPanels(token: string): Promise<PaginatedResponse<Panel>> {
  return helenaFetch('/crm/v2/panel', {}, token)
}

export function getPanel(id: string, token: string): Promise<Panel> {
  return helenaFetch(`/crm/v1/panel/${id}`, {}, token)
}

export function listPanelCards(
  panelId: string,
  token: string,
  page = 1,
  pageSize = 100
): Promise<PaginatedResponse<PanelCard>> {
  return helenaFetch(
    `/crm/v1/panel/card?PanelId=${panelId}&Page=${page}&PageSize=${pageSize}`,
    {},
    token
  )
}

export async function getCardByContact(
  panelId: string,
  contactId: string,
  token: string
): Promise<PanelCard | null> {
  const data: PaginatedResponse<PanelCard> = await helenaFetch(
    `/crm/v1/panel/card?PanelId=${panelId}&ContactId=${contactId}&PageSize=1`,
    {},
    token
  )
  return data.items[0] ?? null
}

// fields array tells Helena which properties to update — only include what changed
// Returns the updated card (PUT /crm/v2/panel/card/{id} responds with full card)
export function moveCard(
  cardId: string,
  updates: MoveCardInput,
  token: string
): Promise<PanelCard> {
  const fields: string[] = []
  if (updates.stepId !== undefined) fields.push('StepId')
  if (updates.description !== undefined) fields.push('Description')
  if (updates.tagIds !== undefined) fields.push('TagIds')

  return helenaFetch(
    `/crm/v2/panel/card/${cardId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ fields, ...updates }),
    },
    token
  )
}

// GET /v1/tag — retorna 400 "badrequest" com os tokens CRM e integração atuais.
// O endpoint existe mas requer parâmetros ou escopo de token não documentado pela Helena.
// Workaround: colher tagIds dos cards via listPanelCards e manter mapeamento manual (TASK-012).
// Quando a Helena liberar o escopo correto, substituir a implementação abaixo.
export async function listTags(token: string): Promise<Tag[]> {
  const data: PaginatedResponse<Tag> = await helenaFetch('/v1/tag?PageSize=200', {}, token)
  return data.items
}

export function getCardNotes(
  cardId: string,
  token: string
): Promise<PaginatedResponse<CardNote>> {
  return helenaFetch(`/crm/v1/panel/card/${cardId}/note`, {}, token)
}

export function createCardNote(
  cardId: string,
  text: string,
  token: string
): Promise<CardNote> {
  return helenaFetch(
    `/crm/v1/panel/card/${cardId}/note`,
    { method: 'POST', body: JSON.stringify({ text }) },
    token
  )
}
