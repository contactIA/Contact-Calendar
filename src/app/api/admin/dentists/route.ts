import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const createSchema = z.object({
  // user fields
  name:        z.string().min(1).max(100),
  email:       z.string().email().optional(),
  external_id: z.string().min(1),
  unit_id:     z.string().uuid().optional(),
  // dentist fields
  cro:       z.string().max(30).optional(),
  specialty: z.array(z.string()).default([]),
  color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
})

// GET /api/admin/dentists
export const GET = withAuth(async (_req, ctx) => {
  const { data, error } = await supabaseAdmin
    .from('dentists')
    .select(`
      id, cro, specialty, color, created_at,
      user:users(id, name, email, external_id, role, unit_id),
      units:dentist_units(unit_id, priority, unit:units(id, name))
    `)
    .eq('account_id', ctx.user.accountId)
    .order('created_at')

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// POST /api/admin/dentists — creates user + dentist in one step
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { name, email, external_id, unit_id, cro, specialty, color } = parsed.data

  // Create user with dentist role
  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .insert({
      account_id:  ctx.user.accountId,
      name,
      email,
      external_id,
      unit_id:     unit_id ?? null,
      role:        'dentist',
    })
    .select()
    .single()

  if (userErr) return err(userErr.message, 500)

  // Create dentist record linked to user
  const { data: dentist, error: dentistErr } = await supabaseAdmin
    .from('dentists')
    .insert({
      account_id: ctx.user.accountId,
      user_id:    user.id,
      cro:        cro ?? null,
      specialty,
      color,
    })
    .select(`
      id, cro, specialty, color, created_at,
      user:users(id, name, email, external_id, role, unit_id)
    `)
    .single()

  if (dentistErr) {
    // Rollback user creation
    await supabaseAdmin.from('users').delete().eq('id', user.id)
    return err(dentistErr.message, 500)
  }

  return ok(dentist, 201)
}, ['admin'])
