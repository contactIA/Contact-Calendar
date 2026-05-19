import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const updateSchema = z.object({
  cro:       z.string().max(30).optional(),
  specialty: z.array(z.string()).optional(),
  color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  // user fields (optional)
  name:    z.string().min(1).max(100).optional(),
  email:   z.string().email().optional(),
  unit_id: z.string().uuid().optional(),
})

// GET /api/admin/dentists/:id
export const GET = withAuth(async (_req, ctx, params) => {
  const { data, error } = await supabaseAdmin
    .from('dentists')
    .select(`
      id, cro, specialty, color, created_at,
      user:users(id, name, email, external_id, role, unit_id),
      units:dentist_units(id, unit_id, priority, unit:units(id, name)),
      schedules:dentist_schedules(id, day_of_week, start_time, end_time, unit_id),
      priorities:dentist_priorities(id, priority, consider_occupation, consider_patient_history, procedure_id, unit_id)
    `)
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Not found', 404)
  return ok(data)
}, ['admin'])

// PATCH /api/admin/dentists/:id
export const PATCH = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { name, email, unit_id, ...dentistFields } = parsed.data

  // Update dentist record
  const { data: dentist, error: dentistErr } = await supabaseAdmin
    .from('dentists')
    .update(dentistFields)
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)
    .select('id, user_id')
    .single()

  if (dentistErr) return err(dentistErr.message, 500)
  if (!dentist) return err('Not found', 404)

  // Update user fields if provided
  if (name !== undefined || email !== undefined || unit_id !== undefined) {
    const { error: userErr } = await supabaseAdmin
      .from('users')
      .update({
        ...(name !== undefined    && { name }),
        ...(email !== undefined   && { email }),
        ...(unit_id !== undefined && { unit_id }),
      })
      .eq('id', dentist.user_id)
      .eq('account_id', ctx.user.accountId)

    if (userErr) return err(userErr.message, 500)
  }

  const { data, error } = await supabaseAdmin
    .from('dentists')
    .select(`
      id, cro, specialty, color, created_at,
      user:users(id, name, email, external_id, role, unit_id)
    `)
    .eq('id', params.id)
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// DELETE /api/admin/dentists/:id
export const DELETE = withAuth(async (_req, ctx, params) => {
  // Fetch user_id before deleting dentist
  const { data: dentist } = await supabaseAdmin
    .from('dentists')
    .select('user_id')
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)
    .single()

  if (!dentist) return err('Not found', 404)

  const { error } = await supabaseAdmin
    .from('dentists')
    .delete()
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
}, ['admin'])
