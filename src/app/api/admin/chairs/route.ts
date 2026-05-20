import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const createSchema = z.object({
  name:    z.string().min(1).max(100),
  unit_id: z.string().uuid(),
})

const listSchema = z.object({
  unit_id: z.string().uuid().optional(),
})

// GET /api/admin/chairs
export const GET = withAuth(async (req, ctx) => {
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = listSchema.safeParse(params)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  let query = supabaseAdmin
    .from('chairs')
    .select('id, name, is_active, unit_id, unit:units(id, name), created_at')
    .eq('account_id', ctx.user.accountId)
    .order('name')

  if (parsed.data.unit_id) query = query.eq('unit_id', parsed.data.unit_id)

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin', 'receptionist', 'dentist'])

// POST /api/admin/chairs
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
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
    .from('chairs')
    .insert({ ...parsed.data, account_id: ctx.user.accountId })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
}, ['admin'])
