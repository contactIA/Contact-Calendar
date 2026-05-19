import { NextRequest } from 'next/server'
import { authenticateHumanUser } from '@/lib/auth'
import { ok, err } from '@/lib/api'

// POST /api/auth/url
// Body: { accountId, userId (externalId do white label) }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.accountId || !body?.userId) {
    return err('accountId and userId are required', 400)
  }

  const result = await authenticateHumanUser(body.accountId, body.userId)
  if (!result) return err('Invalid credentials', 401)

  return ok({ token: result.token, expires_in: result.expiresIn, role: result.user.role })
}
