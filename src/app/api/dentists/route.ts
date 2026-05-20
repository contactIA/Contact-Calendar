import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/dentists — leitura aberta a todos os roles autenticados
export const GET = withAuth(async (_req, ctx) => {
  const { data, error } = await supabaseAdmin
    .from('dentists')
    .select(`
      id, cro, specialty, color,
      user:users(id, name, email),
      units:dentist_units(unit_id, priority)
    `)
    .eq('account_id', ctx.user.accountId)
    .order('created_at')

  if (error) return err(error.message, 500)
  return ok(data)
})
