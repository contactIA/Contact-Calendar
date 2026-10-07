import { supabaseAdmin } from '@/lib/supabase'
import type {
  Patient360Payload, Patient360TimelineItem,
} from '@/types/patient360'

// ============================================================================
// Agregador de dados do Paciente 360° (TASK-051-A).
//
// patient360Data(patientId, accountId) reúne em UMA função:
//   - cadastro do paciente (+ vínculo Helena)
//   - timeline de consultas (ordenada por start_at DESC, com procedimento/profissional)
//
// O card do funil saiu daqui junto com o espelho do painel nativo: ele mora
// no CRM e volta pela API do CRM quando a agenda for ligada a ele.
//
// SEGURANÇA: TODA query cruza account_id (do JWT, nunca do cliente) + patient_id.
// Retorna null se o paciente não pertence à conta (evita IDOR).
// ============================================================================

// Join aninhado idêntico ao APPOINTMENT_SELECT das rotas de agenda:
// dentist não tem name — vem via user; procedure tem name direto.
const TIMELINE_SELECT = `
  id, start_at, end_at, status, confirmation_status,
  cancelled_at, cancelled_reason, closed_value, closed_at, notes,
  dentist:dentists(user:users(name)),
  procedure:procedures(name)
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTimelineItem(a: any): Patient360TimelineItem {
  return {
    id:                  a.id,
    start_at:            a.start_at,
    end_at:              a.end_at,
    status:              a.status,
    confirmation_status: a.confirmation_status ?? null,
    cancelled_at:        a.cancelled_at ?? null,
    cancelled_reason:    a.cancelled_reason ?? null,
    closed_value:        a.closed_value ?? null,
    closed_at:           a.closed_at ?? null,
    notes:               a.notes ?? null,
    procedure_name:      a.procedure?.name ?? null,
    dentist_name:        a.dentist?.user?.name ?? null,
  }
}

export async function patient360Data(
  patientId: string,
  accountId: string,
): Promise<Patient360Payload | null> {
  // 1. Paciente — cruza account_id (retorna null se não for da conta: anti-IDOR).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: patient, error: pErr } = await (supabaseAdmin as any)
    .from('patients')
    .select('id, name, phone, phone_e164, email, birth_date, helena_contact_id, helena_lead_id')
    .eq('id', patientId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (pErr) throw new Error(`Erro ao carregar paciente: ${pErr.message}`)
  if (!patient) return null

  // 2. Timeline — consultas do paciente NA conta, DESC (inclui cancel/faltas).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: appts, error: aErr } = await (supabaseAdmin as any)
    .from('appointments')
    .select(TIMELINE_SELECT)
    .eq('patient_id', patientId)
    .eq('account_id', accountId)
    .order('start_at', { ascending: false })
  if (aErr) throw new Error(`Erro ao carregar timeline: ${aErr.message}`)

  const timeline = (appts ?? []).map(mapTimelineItem)
  const last_visit = timeline.find((t: Patient360TimelineItem) => t.status === 'completed') ?? null

  return {
    patient: {
      id:                patient.id,
      name:              patient.name,
      phone:             patient.phone ?? null,
      phone_e164:        patient.phone_e164 ?? null,
      email:             patient.email ?? null,
      birth_date:        patient.birth_date ?? null,
      helena_contact_id: patient.helena_contact_id ?? null,
      helena_lead_id:    patient.helena_lead_id ?? null,
    },
    timeline,
    last_visit,
    helenaLink: {
      contact_id: patient.helena_contact_id ?? null,
      lead_id:    patient.helena_lead_id ?? null,
      linked:     Boolean(patient.helena_contact_id),
    },
  }
}
