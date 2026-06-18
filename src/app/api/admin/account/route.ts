import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const updateSchema = z.object({
  slot_interval_minutes: z.number().int().positive().max(240).optional(),
  timezone:              z.string().min(1).max(64).optional(),
})

// GET /api/admin/account — configurações gerais da conta
export const GET = withAuth(async (_req, ctx) => {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id, name, slug, timezone, slot_interval_minutes')
    .eq('id', ctx.user.accountId)
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// PATCH /api/admin/account — atualiza configurações gerais (cadência da grade, timezone)
export const PATCH = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  if (Object.keys(parsed.data).length === 0) {
    return err('Nenhum campo para atualizar', 400)
  }

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .update(parsed.data)
    .eq('id', ctx.user.accountId)
    .select('id, name, slug, timezone, slot_interval_minutes')
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])
