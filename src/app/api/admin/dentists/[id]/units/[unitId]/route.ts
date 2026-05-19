import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const updateSchema = z.object({
  priority: z.number().int().min(1),
})

// PATCH /api/admin/dentists/:id/units/:unitId
export const PATCH = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data, error } = await supabaseAdmin
    .from('dentist_units')
    .update({ priority: parsed.data.priority })
    .eq('dentist_id', params.id)
    .eq('unit_id', params.unitId)
    .eq('account_id', ctx.user.accountId)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Not found', 404)
  return ok(data)
}, ['admin'])

// DELETE /api/admin/dentists/:id/units/:unitId — unlink dentist from unit
export const DELETE = withAuth(async (_req, ctx, params) => {
  const { error } = await supabaseAdmin
    .from('dentist_units')
    .delete()
    .eq('dentist_id', params.id)
    .eq('unit_id', params.unitId)
    .eq('account_id', ctx.user.accountId)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
}, ['admin'])
