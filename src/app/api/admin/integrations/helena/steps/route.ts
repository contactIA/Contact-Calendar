import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { getAccountIntegration, getPanel } from '@/lib/helena'

// GET /api/admin/integrations/helena/steps?panelId=xxx
// Retorna as etapas (steps) de um painel Helena — para popular a tabela de mapeamento.
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const panelId = req.nextUrl.searchParams.get('panelId')
  if (!panelId) return err('panelId é obrigatório', 400)

  const integ = await getAccountIntegration(ctx.user.accountId)
  if (!integ) return err('Integração Helena não configurada ou token ausente', 400)

  try {
    // A Helena só devolve as etapas do painel com ?IncludeDetails=Steps —
    // sem esse parâmetro, `steps` vem sempre null. Não existe endpoint dedicado.
    const panel = await getPanel(panelId, integ.helena_token!, true)
    const steps = panel.steps ?? []

    return ok({
      data: steps
        .map((s) => ({ id: s.id, name: s.title, order: s.position ?? 0 }))
        .sort((a, b) => a.order - b.order),
    })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Erro ao buscar etapas do painel', 502)
  }
}, ['admin'])
