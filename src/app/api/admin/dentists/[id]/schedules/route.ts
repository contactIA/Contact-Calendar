import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const createSchema = z.object({
  unit_id:     z.string().uuid(),
  day_of_week: z.number().int().min(0).max(6),
  start_time:  z.string().regex(/^\d{2}:\d{2}$/),
  end_time:    z.string().regex(/^\d{2}:\d{2}$/),
})

// GET /api/admin/dentists/:id/schedules
export const GET = withAuth(async (_req, ctx, params) => {
  const { data, error } = await supabaseAdmin
    .from('dentist_schedules')
    .select('id, day_of_week, start_time, end_time, unit_id, unit:units(id, name)')
    .eq('dentist_id', params.id)
    .eq('account_id', ctx.user.accountId)
    .order('day_of_week')

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// POST /api/admin/dentists/:id/schedules
export const POST = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  if (parsed.data.start_time >= parsed.data.end_time) {
    return err('start_time must be before end_time', 400)
  }

  const { data, error } = await supabaseAdmin
    .from('dentist_schedules')
    .insert({
      account_id:  ctx.user.accountId,
      dentist_id:  params.id,
      ...parsed.data,
    })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
}, ['admin'])
