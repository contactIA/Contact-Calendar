import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const createSchema = z.object({
  name:                z.string().min(1).max(100),
  duration_minutes:    z.number().int().positive(),
  color:               z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  required_specialty:  z.string().max(100).optional(),
})

// GET /api/admin/procedures
export const GET = withAuth(async (_req, ctx) => {
  const { data, error } = await supabaseAdmin
    .from('procedures')
    .select('id, name, duration_minutes, color, required_specialty, is_active, created_at')
    .eq('account_id', ctx.user.accountId)
    .order('name')

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// POST /api/admin/procedures
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data, error } = await supabaseAdmin
    .from('procedures')
    .insert({ ...parsed.data, account_id: ctx.user.accountId })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
}, ['admin'])
