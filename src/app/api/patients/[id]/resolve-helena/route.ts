import { withAuth, ok, err } from '@/lib/api'
import { supabaseAdmin } from '@/lib/supabase'
import { resolveHelenaLink } from '@/lib/patient/resolveHelena'

// ============================================================================
// POST /api/patients/:id/resolve-helena — força a resolução do vínculo Helena
// do paciente por telefone (TASK-050). Síncrono: retorna o resultado, ao
// contrário do PATCH que dispara fire-and-forget. Serve para revincular manual
// e para testar o fluxo de ponta a ponta.
//
// Segurança: mesmos papéis do PATCH de paciente; account_id sempre do JWT.
// ============================================================================

export const POST = withAuth(async (_req, ctx, params) => {
  // Carrega o telefone do paciente (cruzando account_id — nunca do body).
  const { data: patient, error } = await supabaseAdmin
    .from('patients')
    .select('id, phone, phone_e164')
    .eq('id', params.id)
    .eq('account_id', ctx.user.accountId)
    .single()

  if (error) return err(error.message, 500)
  if (!patient) return err('Not found', 404)

  const result = await resolveHelenaLink({
    accountId: ctx.user.accountId,
    patientId: patient.id,
    phone:     patient.phone,
    phoneE164: patient.phone_e164,
  })

  return ok(result)
}, ['admin', 'receptionist'])
