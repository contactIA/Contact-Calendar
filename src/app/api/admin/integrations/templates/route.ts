import { withAuth, ok, err } from '@/lib/api'
import { getHelenaTokenForAccount, listTemplates } from '@/lib/helena'

// GET /api/admin/integrations/templates — templates aprovados na Helena da conta
export const GET = withAuth(async (_req, ctx) => {
  const token = await getHelenaTokenForAccount(ctx.user.accountId)
  if (!token) return err('Configure o token da Helena primeiro', 400)
  try {
    return ok({ data: await listTemplates(token) })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Falha ao consultar a Helena', 502)
  }
}, ['admin'])
