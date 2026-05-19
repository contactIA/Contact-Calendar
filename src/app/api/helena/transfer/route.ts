import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { transferToTeam } from '@/lib/helena'
import { z } from 'zod'

const bodySchema = z.object({
  session_id:    z.string().uuid(),
  department_id: z.string().uuid(),
})

// POST /api/helena/transfer
// Usado pelo agente de IA quando não consegue resolver o agendamento
export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  try {
    await transferToTeam(parsed.data.session_id, parsed.data.department_id)
    return ok({ transferred: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Helena API error'
    return err(msg, 502)
  }
}, ['ai_agent', 'receptionist', 'admin'])
