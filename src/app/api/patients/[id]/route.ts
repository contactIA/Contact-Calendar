import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { syncPatientContact } from '@/lib/helena'
import { z } from 'zod'

const updateSchema = z.object({
  name:       z.string().min(1).optional(),
  phone:      z.string().optional(),
  email:      z.string().email().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:      z.string().optional(),
})

// PATCH /api/patients/:id
export const PATCH = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data, error } = await supabaseAdmin
    .from('patients')
    .update(parsed.data)
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Not found', 404)

  // Best-effort: reflete as mudanças no contato da Helena (não bloqueia a edição).
  await syncPatientContact(ctx.user.accountId, data)

  return ok(data)
}, ['admin', 'receptionist'])

// DELETE /api/patients/:id
export const DELETE = withAuth(async (_req, ctx, params) => {
  const { error } = await supabaseAdmin
    .from('patients')
    .delete()
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
}, ['admin'])
