import { withAuth, ok, err } from '@/lib/api'
import { patient360Data } from '@/lib/patient/patient360Data'

// ============================================================================
// GET /api/patients/:id/timeline — histórico de consultas do paciente (TASK-051-A).
// Ordenado por start_at DESC, incluindo cancelamentos e faltas; destaca a
// última visita concluída (last_visit). Reusa patient360Data (fonte única).
//
// Segurança: account_id do JWT; null (paciente de outra conta) -> 404.
// ============================================================================

export const GET = withAuth(async (_req, ctx, params) => {
  try {
    const data = await patient360Data(params.id, ctx.user.accountId)
    if (!data) return err('Not found', 404)
    return ok({ timeline: data.timeline, last_visit: data.last_visit })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Erro ao carregar timeline', 500)
  }
}, ['admin', 'receptionist'])
