import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const createSchema = z.object({
  label: z.string().min(1).max(100),
})

// GET /api/admin/api-keys — list keys (hash never exposed)
export const GET = withAuth(async (_req, ctx) => {
  const { data, error } = await supabaseAdmin
    .from('ai_api_keys')
    .select('id, label, is_active, last_used_at, created_at')
    .eq('account_id', ctx.user.accountId)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)
  return ok(data)
}, ['admin'])

// POST /api/admin/api-keys — create key, returns plain key ONCE
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return err(parsed.error.issues[0].message, 400)

  const plainKey = 'esc_' + randomBytes(32).toString('hex')
  const key_hash = await bcrypt.hash(plainKey, 10)

  const { data, error } = await supabaseAdmin
    .from('ai_api_keys')
    .insert({
      account_id: ctx.user.accountId,
      label:      parsed.data.label,
      key_hash,
    })
    .select('id, label, is_active, created_at')
    .single()

  if (error) return err(error.message, 500)

  // Plain key returned only here — never stored, never retrievable again
  return ok({ ...data, key: plainKey }, 201)
}, ['admin'])
