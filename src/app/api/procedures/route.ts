import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/procedures — leitura aberta a todos os roles autenticados
export const GET = withAuth(async (_req, ctx) => {
  const { data, error } = await supabaseAdmin
    .from('procedures')
    .select('id, name, duration_minutes, color, required_specialty')
    .eq('account_id', ctx.user.accountId)
    .eq('is_active', true)
    .order('name')

  if (error) return err(error.message, 500)
  return ok(data)
})
