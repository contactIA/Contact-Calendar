import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const updateSchema = z.object({
  day_of_week: z.number().int().min(0).max(6).optional(),
  start_time:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time:    z.string().regex(/^\d{2}:\d{2}$/).optional(),
  unit_id:     z.string().uuid().optional(),
})

// PATCH /api/admin/dentists/:id/schedules/:scheduleId
export const PATCH = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data, error } = await supabaseAdmin
    .from('dentist_schedules')
    .update(parsed.data)
    .eq('id', params.scheduleId)
    .eq('dentist_id', params.id)
    .eq('account_id', ctx.user.accountId)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Not found', 404)
  return ok(data)
}, ['admin'])

// DELETE /api/admin/dentists/:id/schedules/:scheduleId
export const DELETE = withAuth(async (_req, ctx, params) => {
  const { error } = await supabaseAdmin
    .from('dentist_schedules')
    .delete()
    .eq('id', params.scheduleId)
    .eq('dentist_id', params.id)
    .eq('account_id', ctx.user.accountId)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
}, ['admin'])
