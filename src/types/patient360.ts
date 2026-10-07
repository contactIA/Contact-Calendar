// ============================================================================
// Contrato do Paciente 360° (TASK-051-A) — pavimentação para o drawer (TASK-051-B).
//
// Este é o "combinado" entre quem entrega os dados (André, backend) e quem
// consome (Gabriel, drawer UI). O endpoint GET /api/patients/[id]/360 devolve
// exatamente este Patient360Payload em UMA chamada. Gabriel importa este type.
//
// Nota: campos refletem o SCHEMA REAL (não a spec original):
//   - faltas não têm coluna própria — vêm como status='no_show'
//   - cancelamentos vêm por cancelled_at/cancelled_reason
//   - nome do profissional vem via dentist->user (dentist não tem name direto)
//   - helena_lead_id fica null por ora (débito da TASK-050; a API por telefone
//     não devolve o lead)
// ============================================================================

export interface Patient360Patient {
  id:                string
  name:              string
  phone:             string | null
  phone_e164:        string | null
  email:             string | null
  birth_date:        string | null
  helena_contact_id: string | null
  helena_lead_id:    string | null
}

// Um item do histórico de consultas (já ordenado por start_at DESC no backend).
export interface Patient360TimelineItem {
  id:                  string
  start_at:            string
  end_at:              string
  status:              string        // confirmed | completed | cancelled | no_show | ...
  confirmation_status: string | null
  cancelled_at:        string | null
  cancelled_reason:    string | null
  closed_value:        number | null
  closed_at:           string | null
  notes:               string | null
  procedure_name:      string | null
  dentist_name:        string | null
}

export interface Patient360HelenaLink {
  contact_id: string | null
  lead_id:    string | null
  linked:     boolean
}

export interface Patient360Payload {
  patient:     Patient360Patient
  timeline:    Patient360TimelineItem[]   // ordenada por start_at DESC
  last_visit:  Patient360TimelineItem | null  // consulta 'completed' mais recente
  helenaLink:  Patient360HelenaLink
}
