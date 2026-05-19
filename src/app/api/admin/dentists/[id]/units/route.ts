import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const linkSchema = z.object({
  unit_id:  z.string().uuid(),
  priority: z.number().int().min(1).default(1),
})

// GET /api/admin/dentists/:id/units
export const GET = withAuth(async (_req, ctx, params) => {
  const { data, error } = await supabaseAdmin
    .from('dentist_units')
    .select('id, unit_id, priority, unit:units(id, name, is_active)')
    .eq('dentist_id', params.id)
    .eq('account_id', ctx.user.accountId)
    .order('priority')

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// POST /api/admin/dentists/:id/units — link dentist to a unit
export const POST = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = linkSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  // Validate unit belongs to this account
  const { data: unit } = await supabaseAdmin
    .from('units')
    .select('id')
    .eq('id', parsed.data.unit_id)
    .eq('account_id', ctx.user.accountId)
    .single()

  if (!unit) return err('Unit not found', 404)

  const { data, error } = await supabaseAdmin
    .from('dentist_units')
    .insert({
      account_id: ctx.user.accountId,
      dentist_id: params.id,
      unit_id:    parsed.data.unit_id,
      priority:   parsed.data.priority,
    })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
}, ['admin'])
