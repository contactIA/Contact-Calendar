import { withAuth, ok, err } from '@/lib/api'
import { syncPanel } from '@/lib/sync/panelMirror'

// POST /api/admin/integrations/helena/sync
// Dispara a carga inicial paginada do painel Helena no espelho local.
// Admin-only. Idempotente: pode ser chamado múltiplas vezes sem duplicar dados.
export const POST = withAuth(async (_req, ctx) => {
  try {
    const result = await syncPanel(ctx.user.accountId)
    return ok({ data: result })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Erro ao sincronizar painel', 502)
  }
}, ['admin'])
