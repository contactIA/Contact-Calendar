import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const createSchema = z.object({
  name:       z.string().min(1),
  phone:      z.string().optional(),
  email:      z.string().email().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:      z.string().optional(),
})

// GET /api/patients?q=...&page=1&page_size=50
export const GET = withAuth(async (req, ctx) => {
  const q         = req.nextUrl.searchParams.get('q') ?? ''
  const page      = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? '1'))
  const page_size = Math.min(Number(req.nextUrl.searchParams.get('page_size') ?? '50'), 100)
  const from      = (page - 1) * page_size

  if (q.length > 0 && q.length < 3) return err('q must be at least 3 characters', 400)

  let query = supabaseAdmin
    .from('patients')
    .select('id, name, phone, email, birth_date, created_at', { count: 'exact' })
    .eq('account_id', ctx.user.accountId)
    .order('name')
    .range(from, from + page_size - 1)

  if (q.length >= 3) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)

  const { data, error, count } = await query
  if (error) return err(error.message, 500)

  return ok({ data: data ?? [], total: count ?? 0, page, page_size })
})

// POST /api/patients
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const { data, error } = await supabaseAdmin
    .from('patients')
    .insert({ account_id: ctx.user.accountId, ...parsed.data })
    .select()
    .single()

  if (error) return err(error.message, 500)

  return ok(data, 201)
}, ['admin', 'receptionist', 'ai_agent'])
