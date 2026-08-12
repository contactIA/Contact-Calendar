import { supabaseAdmin } from '@/lib/supabase'

// ============================================================================
// statusToStep (TASK-022) — traduz um status interno do funil para o StepId
// (local, uuid de helena_steps) correspondente na tabela `step_mappings`.
//
// `step_mappings` é a fonte CANÔNICA deste mapeamento (ver decisão registrada
// em 20260701134500_helena_mirror.sql) — não a coluna JSONB legada
// account_integrations.step_mappings (migration 0008, débito técnico da
// TASK-011, ainda não migrada no HelenaIntegrationTab).
//
// As chaves de `appointment_status` são as mesmas 8 usadas pela cardSyncEngine
// (ver KIND_TO_STATUS_KEY) e já conhecidas do admin em FUNIL_STAGES
// (HelenaIntegrationTab.tsx): scheduled, cancelled, rescheduled, no_show,
// attended, attended_no_close, attended_closed, not_scheduled.
// ============================================================================

// null = sem mapeamento configurado para esta conta/status (o admin não
// escolheu etapa em Configurações > Integração Helena). O chamador decide se
// isso é erro fatal ou se o card fica sem se mover.
export async function statusToStep(
  accountId: string,
  appointmentStatus: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('step_mappings')
    .select('target_step_id')
    .eq('account_id', accountId)
    .eq('appointment_status', appointmentStatus)
    .maybeSingle()

  if (error) throw new Error(`Erro ao ler step_mappings (status="${appointmentStatus}"): ${error.message}`)
  return data?.target_step_id ?? null
}
