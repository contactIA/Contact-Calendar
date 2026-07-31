import { NextRequest } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { authenticateHumanUser } from '@/lib/auth'
import { ok, err } from '@/lib/api'

export const runtime = 'nodejs'

// POST /api/auth/url
// Body: { accountId, userId (externalId do white label) }
//
// SEGURANÇA (FIND-001): este endpoint emite um token de sessão a partir de um
// external_id que NÃO é secreto (e-mail/CPF, visível em URLs). Sem uma barreira,
// qualquer um forjaria login de admin. Por isso exige um segredo compartilhado
// (WHITELABEL_AUTH_SECRET) que só o sistema-pai (white label) conhece, enviado
// no header `x-whitelabel-secret` ou `Authorization: Bearer <secret>`.
//   - sem WHITELABEL_AUTH_SECRET no ambiente -> 503 (fail-closed)
//   - segredo ausente/errado -> 401 (comparação timing-safe)

function extractSecret(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return req.headers.get('x-whitelabel-secret')
}

function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const expected = process.env.WHITELABEL_AUTH_SECRET
  if (!expected) return err('service unavailable', 503)

  const provided = extractSecret(req)
  if (!provided || !secretMatches(provided, expected)) {
    return err('unauthorized', 401)
  }

  const body = await req.json().catch(() => null)
  if (!body?.accountId || !body?.userId) {
    return err('accountId and userId are required', 400)
  }

  const result = await authenticateHumanUser(body.accountId, body.userId)
  if (!result) return err('Invalid credentials', 401)

  return ok({ token: result.token, expires_in: result.expiresIn, role: result.user.role })
}
