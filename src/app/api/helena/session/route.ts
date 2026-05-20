import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { getContactByPhone, getActiveSessionByContactId, buildSessionUrl } from '@/lib/helena'

// GET /api/helena/session?phone=5511999999999
// Busca a sessão ativa do paciente na Helena e retorna a URL do Fluxodonto.
// Fallback: wa.me se não encontrar sessão ou token não configurado.
export const GET = withAuth(async (req: NextRequest) => {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return err('phone is required', 400)

  const clean = phone.replace(/\D/g, '')

  if (!process.env.HELENA_API_TOKEN) {
    return ok({ url: `https://wa.me/${clean}`, fallback: true })
  }

  const contactId = await getContactByPhone(clean)
  if (!contactId) {
    return ok({ url: `https://wa.me/${clean}`, fallback: true })
  }

  const sessionId = await getActiveSessionByContactId(contactId)
  if (!sessionId) {
    return ok({ url: `https://wa.me/${clean}`, fallback: true })
  }

  return ok({ url: buildSessionUrl(sessionId), fallback: false })
})
