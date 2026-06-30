import { NextRequest } from 'next/server'
import { withAuth, ok, err } from '@/lib/api'
import { getAccountIntegration, helenaFetch } from '@/lib/helena'

// GET /api/admin/integrations/helena/steps?panelId=xxx
// Retorna as etapas (steps) de um painel Helena — para popular a tabela de mapeamento.
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const panelId = req.nextUrl.searchParams.get('panelId')
  if (!panelId) return err('panelId é obrigatório', 400)

  const integ = await getAccountIntegration(ctx.user.accountId)
  if (!integ) return err('Integração Helena não configurada ou token ausente', 400)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const panel = await helenaFetch(integ.helena_token!, `/crm/v1/panel/${panelId}`) as any
    // A Helena retorna as etapas dentro do painel em `steps` ou `columns`
    const steps: { id: string; title: string; order?: number }[] =
      panel?.steps ?? panel?.columns ?? panel?.phases ?? []

    return ok({
      data: steps
        .map((s) => ({ id: s.id, name: s.title, order: s.order ?? 0 }))
        .sort((a, b) => a.order - b.order),
    })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Erro ao buscar etapas do painel', 502)
  }
}, ['admin'])
