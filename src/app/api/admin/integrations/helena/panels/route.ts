import { withAuth, ok, err } from '@/lib/api'
import { getAccountIntegration, listPanels } from '@/lib/helena'

// GET /api/admin/integrations/helena/panels
// Lista os painéis Helena da conta para o admin selecionar o painel CRM.
export const GET = withAuth(async (_req, ctx) => {
  const integ = await getAccountIntegration(ctx.user.accountId)
  if (!integ) return err('Integração Helena não configurada ou token ausente', 400)

  try {
    const result = await listPanels(integ.helena_token!)
    const panels = result.items.map(p => ({ id: p.id, name: p.title, key: p.key }))
    return ok({ data: panels })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Erro ao buscar painéis', 502)
  }
}, ['admin'])
