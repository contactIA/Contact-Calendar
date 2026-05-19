import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const blockTypes = ['absence', 'break', 'meeting', 'reserved'] as const

const createSchema = z.object({
  unit_id:  z.string().uuid(),
  start_at: z.string().datetime(),
  end_at:   z.string().datetime(),
  type:     z.enum(blockTypes),
  rrule:    z.string().max(500).optional(),
})

const listSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// GET /api/admin/dentists/:id/blocks
export const GET = withAuth(async (req, ctx, params) => {
  const qp = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = listSchema.safeParse(qp)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  let query = supabaseAdmin
    .from('schedule_blocks')
    .select('id, start_at, end_at, type, rrule, unit_id, created_at')
    .eq('dentist_id', params.id)
    .eq('account_id', ctx.user.accountId)
    .order('start_at')

  if (parsed.data.from) query = query.gte('start_at', `${parsed.data.from}T00:00:00Z`)
  if (parsed.data.to)   query = query.lte('start_at', `${parsed.data.to}T23:59:59Z`)

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// POST /api/admin/dentists/:id/blocks
export const POST = withAuth(async (req, ctx, params) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  if (parsed.data.start_at >= parsed.data.end_at) {
    return err('start_at must be before end_at', 400)
  }

  const { data, error } = await supabaseAdmin
    .from('schedule_blocks')
    .insert({
      account_id:  ctx.user.accountId,
      dentist_id:  params.id,
      created_by:  ctx.user.sub,
      ...parsed.data,
    })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
}, ['admin'])
