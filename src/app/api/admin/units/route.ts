import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const createSchema = z.object({
  name:    z.string().min(1).max(100),
  address: z.string().max(300).optional(),
  phone:   z.string().max(20).optional(),
})

// GET /api/admin/units
export const GET = withAuth(async (_req, ctx) => {
  const { data, error } = await supabaseAdmin
    .from('units')
    .select('id, name, address, phone, is_active, created_at')
    .eq('account_id', ctx.user.accountId)
    .order('name')

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// POST /api/admin/units
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data, error } = await supabaseAdmin
    .from('units')
    .insert({ ...parsed.data, account_id: ctx.user.accountId })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
}, ['admin'])
