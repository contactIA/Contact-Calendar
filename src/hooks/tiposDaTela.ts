// Os tipos que as telas antigas usam (nomes em inglês, do código antigo). Os hooks
// os montam a partir da API v1 (./daApi.ts) e os reexportam.

export type Appointment = {
  id: string
  start_at: string
  end_at: string
  duration_minutes: number
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
  notes: string | null
  created_by_role: string
  /** Mande de volta ao mudar a consulta: se outra pessoa mudou antes, a API recusa (409). */
  versao: number
  patient: { id: string; name: string; phone: string | null } | null
  dentist: { id: string; color: string; user: { name: string } | null } | null
  procedure: { id: string; name: string; color: string; duration_minutes: number } | null
  chair: { id: string; name: string } | null
  unit: { id: string; name: string } | null
}

export type Dentist = {
  id: string
  color: string
  cro: string | null
  /** As especialidades, pelo id. */
  specialty: string[]
  user: { id: string; name: string; email: string | null } | null
  units: { unit_id: string; priority: number }[] | null
}

export type Procedure = {
  id: string
  name: string
  duration_minutes: number
  color: string | null
  /** A especialidade exigida, pelo id (vazia: qualquer profissional faz). */
  required_specialty: string[] | null
}

export type Unit = {
  id: string
  name: string
  address: string | null
  phone: string | null
}

export type BlockType = 'absence' | 'break' | 'meeting' | 'reserved'

export type ScheduleBlock = {
  id: string
  dentist_id: string
  unit_id: string
  start_at: string
  end_at: string
  type: BlockType
}

export type DentistSchedule = {
  id: string
  dentist_id: string
  unit_id: string
  day_of_week: number   // 0 = domingo … 6 = sábado (mesma convenção de Date.getDay())
  start_time: string    // 'HH:MM' ou 'HH:MM:SS'
  end_time: string
}
