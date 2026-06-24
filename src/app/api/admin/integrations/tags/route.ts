import { withAuth, ok, err } from '@/lib/api'
import { getHelenaTokenForAccount, listTags } from '@/lib/helena'

// GET /api/admin/integrations/tags — etiquetas disponíveis na Helena da conta
export const GET = withAuth(async (_req, ctx) => {
  const token = await getHelenaTokenForAccount(ctx.user.accountId)
  if (!token) return err('Configure o token da Helena primeiro', 400)
  try {
    return ok({ data: await listTags(token) })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Falha ao consultar a Helena', 502)
  }
}, ['admin'])
