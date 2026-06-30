import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { getAccountIntegration, getContactByPhone, getActiveSessionByContactId, buildSessionUrl } from '@/lib/helena'

// GET /api/helena/session?phone=5511999999999
// Busca a sessão ativa do paciente na Helena e retorna a URL do Fluxodonto.
// Fallback: wa.me se a conta não configurou a Helena ou não houver sessão.
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return err('phone is required', 400)

  const clean = phone.replace(/\D/g, '')
  const fallback = ok({ url: `https://wa.me/${clean}`, fallback: true })

  const integ = await getAccountIntegration(ctx.user.accountId)
  if (!integ) return fallback

  const contactId = await getContactByPhone(integ.helena_token!, clean)
  if (!contactId) return fallback

  const sessionId = await getActiveSessionByContactId(integ.helena_token!, contactId)
  if (!sessionId) return fallback

  return ok({ url: buildSessionUrl(sessionId), fallback: false })
})
