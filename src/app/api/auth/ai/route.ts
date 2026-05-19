import { NextRequest } from 'next/server'
import { authenticateAiAgent } from '@/lib/auth'
import { ok, err } from '@/lib/api'

// POST /api/auth/ai
// Body: { api_key, account_id }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.api_key || !body?.account_id) {
    return err('api_key and account_id are required', 400)
  }

  const result = await authenticateAiAgent(body.api_key, body.account_id)
  if (!result) return err('Invalid API key', 401)

  return ok({ token: result.token, expires_in: result.expiresIn })
}
