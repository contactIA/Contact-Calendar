const BASE_URL = process.env.HELENA_BASE_URL ?? 'https://api.wts.chat'
const TOKEN = process.env.HELENA_API_TOKEN!

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

// Envia mensagem de texto para um contato
export function sendText(to: string, from: string, text: string) {
  return helenaFetch('/chat/v1/send/text', {
    method: 'POST',
    body: JSON.stringify({ to, from, text }),
  })
}

// Envia mensagem dentro de uma conversa existente
export function sendSessionMessage(sessionId: string, text: string) {
  return helenaFetch(`/chat/v1/session/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

// Transfere conversa para uma equipe (departamento)
export function transferToTeam(sessionId: string, departmentId: string) {
  return helenaFetch(`/chat/v1/session/${sessionId}/transfer`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'DEPARTMENT', newDepartmentId: departmentId }),
  })
}

// Conclui atendimento (reativa se chegar nova mensagem)
export function completeSession(sessionId: string, reactivateOnNewMessage = true) {
  return helenaFetch(`/chat/v1/session/${sessionId}/complete`, {
    method: 'PUT',
    body: JSON.stringify({ reactivateOnNewMessage }),
  })
}
