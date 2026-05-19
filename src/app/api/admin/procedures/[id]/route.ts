import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const updateSchema = z.object({
  name:               z.string().min(1).max(100).optional(),
  duration_minutes:   z.number().int().positive().optional(),
  color:              z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  required_specialty: z.string().max(100).optional(),
  is_active:          z.boolean().optional(),
})

// PATCH /api/admin/procedures/:id
export const PATCH = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data, error } = await supabaseAdmin
    .from('procedures')
    .update(parsed.data)
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Not found', 404)
  return ok(data)
}, ['admin'])

// DELETE /api/admin/procedures/:id
export const DELETE = withAuth(async (_req, ctx, params) => {
  const { error } = await supabaseAdmin
    .from('procedures')
    .delete()
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
}, ['admin'])
