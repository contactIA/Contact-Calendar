import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const bodySchema = z.object({
  status: z.enum(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  reason: z.string().optional(),
})

// PATCH /api/appointments/[id]/status
export const PATCH = withAuth(async (req, ctx, params) => {
  const id = params?.id
  if (!id) return err('Missing appointment id', 400)

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { status, reason } = parsed.data

  // IA só pode cancelar
  if (ctx.user.role === 'ai_agent' && status !== 'cancelled') {
    return err('AI agent can only set status to cancelled', 403)
  }

  // Dentista não pode cancelar nem marcar no_show
  if (ctx.user.role === 'dentist' && ['cancelled', 'no_show'].includes(status)) {
    return err('Dentists cannot cancel appointments or mark no_show', 403)
  }

  // Garante que o appointment pertence à conta
  const { data: existing } = await supabaseAdmin
    .from('appointments')
    .select('id, status')
    .eq('id', id)
    .eq('account_id', ctx.user.accountId)
    .single()

  if (!existing) return err('Appointment not found', 404)
  if (['completed', 'cancelled', 'no_show'].includes(existing.status)) {
    return err('Cannot change status of a finalized appointment', 409)
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update({
      status,
      ...(status === 'cancelled' && {
        cancelled_at: new Date().toISOString(),
        cancelled_reason: reason ?? undefined,
      }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return err(error.message, 500)

  return ok(data)
})
