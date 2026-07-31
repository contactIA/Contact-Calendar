import { withAuth, ok, err } from '@/lib/api'
import { patient360Data } from '@/lib/patient/patient360Data'

// ============================================================================
// GET /api/patients/:id/360 — payload completo do Paciente 360° (TASK-051-A).
// Cadastro + timeline + card atual + vínculo Helena em UMA chamada.
// Consumido pelo drawer da TASK-051-B (Gabriel). Contrato: src/types/patient360.ts.
//
// Segurança: account_id sempre do JWT; patient360Data cruza account_id em toda
// query e retorna null se o paciente não é da conta (anti-IDOR) -> 404.
// ============================================================================

export const GET = withAuth(async (_req, ctx, params) => {
  try {
    const data = await patient360Data(params.id, ctx.user.accountId)
    if (!data) return err('Not found', 404)
    return ok(data)
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Erro ao carregar dados do paciente', 500)
  }
}, ['admin', 'receptionist'])
