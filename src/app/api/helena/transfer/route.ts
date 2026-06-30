import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { transferToTeam, getHelenaTokenForAccount } from '@/lib/helena'
import { z } from 'zod'

const bodySchema = z.object({
  session_id:    z.string().uuid(),
  department_id: z.string().uuid(),
})

// POST /api/helena/transfer
// Usado pelo agente de IA quando não consegue resolver o agendamento
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const token = await getHelenaTokenForAccount(ctx.user.accountId)
  if (!token) return err('Integração Helena não configurada para esta conta', 503)

  try {
    await transferToTeam(token, parsed.data.session_id, parsed.data.department_id)
    return ok({ transferred: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Helena API error'
    return err(msg, 502)
  }
}, ['ai_agent', 'receptionist', 'admin'])
