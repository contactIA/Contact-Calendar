import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const updateSchema = z.object({
  is_active: z.boolean(),
})

// PATCH /api/admin/api-keys/:id — toggle active status
export const PATCH = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data, error } = await supabaseAdmin
    .from('ai_api_keys')
    .update({ is_active: parsed.data.is_active })
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)
    .select('id, label, is_active, last_used_at, created_at')
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Not found', 404)
  return ok(data)
}, ['admin'])

// DELETE /api/admin/api-keys/:id
export const DELETE = withAuth(async (_req, ctx, params) => {
  const { error } = await supabaseAdmin
    .from('ai_api_keys')
    .delete()
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
}, ['admin'])
