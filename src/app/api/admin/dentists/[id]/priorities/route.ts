import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const priorityItemSchema = z.object({
  priority:                  z.number().int().min(1),
  consider_occupation:       z.boolean().default(true),
  consider_patient_history:  z.boolean().default(true),
  procedure_id:              z.string().uuid().optional(),
  unit_id:                   z.string().uuid().optional(),
})

// GET /api/admin/dentists/:id/priorities
export const GET = withAuth(async (_req, ctx, params) => {
  const { data, error } = await supabaseAdmin
    .from('dentist_priorities')
    .select('id, priority, consider_occupation, consider_patient_history, procedure_id, unit_id')
    .eq('dentist_id', params.id)
    .eq('account_id', ctx.user.accountId)
    .order('priority')

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// PUT /api/admin/dentists/:id/priorities — replace all priorities for this dentist
export const PUT = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = z.array(priorityItemSchema).safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  // Delete existing and re-insert atomically
  const { error: delErr } = await supabaseAdmin
    .from('dentist_priorities')
    .delete()
    .eq('dentist_id', params.id)
    .eq('account_id', ctx.user.accountId)

  if (delErr) return err(delErr.message, 500)

  if (parsed.data.length === 0) return ok([])

  const rows = parsed.data.map(p => ({
    account_id:               ctx.user.accountId,
    dentist_id:               params.id,
    priority:                 p.priority,
    consider_occupation:      p.consider_occupation,
    consider_patient_history: p.consider_patient_history,
    procedure_id:             p.procedure_id ?? null,
    unit_id:                  p.unit_id ?? null,
  }))

  const { data, error } = await supabaseAdmin
    .from('dentist_priorities')
    .insert(rows)
    .select()

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])
