import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

const createSchema = z.object({
  name:    z.string().min(1).max(100),
  address: z.string().max(300).optional(),
  phone:   z.string().max(20).optional(),
})

// O onboarding público é quem chama (src/app/onboarding).
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
