import type {
  BloqueioJson,
  ConsultaJson,
  ExpedienteJson,
  ProcedimentoJson,
  ProfissionalJson,
  StatusDaConsultaJson,
  UnidadeJson,
} from '@/api/v1/esquemas'
import type { Appointment, BlockType, Dentist, DentistSchedule, Procedure, ScheduleBlock, Unit } from './tiposDaTela'

// A tradução entre a API v1 e os tipos que as telas antigas já usam (fase 6 da
// migração). As telas continuam com os nomes delas; só os hooks conhecem a API.
// Quando as telas forem reescritas no padrão do CRM, este arquivo sai.

export type StatusDaTela = Appointment['status']

export const STATUS_PARA_TELA: Record<StatusDaConsultaJson, StatusDaTela> = {
  agendada: 'scheduled',
  confirmada: 'confirmed',
  em_atendimento: 'in_progress',
  concluida: 'completed',
  cancelada: 'cancelled',
  faltou: 'no_show',
}

export const STATUS_PARA_API = Object.fromEntries(Object.entries(STATUS_PARA_TELA).map(([api, tela]) => [tela, api])) as Record<
  StatusDaTela,
  StatusDaConsultaJson
>

const BLOQUEIO_PARA_TELA: Record<BloqueioJson['tipo'], BlockType> = {
  ausencia: 'absence',
  intervalo: 'break',
  reuniao: 'meeting',
  reservado: 'reserved',
}

const minutosEntre = (inicio: string, fim: string) => Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60_000)

export function paraAppointment(c: ConsultaJson): Appointment {
  return {
    id: c.id,
    start_at: c.inicio,
    end_at: c.fim,
    duration_minutes: minutosEntre(c.inicio, c.fim),
    status: STATUS_PARA_TELA[c.status],
    notes: c.observacoes,
    created_by_role: '',
    versao: c.versao,
    patient: { id: c.paciente.id, name: c.paciente.nome, phone: c.paciente.telefone },
    dentist: { id: c.profissional.id, color: c.profissional.cor, user: { name: c.profissional.nome } },
    procedure: { id: c.procedimento.id, name: c.procedimento.nome, color: c.procedimento.cor, duration_minutes: minutosEntre(c.inicio, c.fim) },
    chair: { id: c.cadeira.id, name: c.cadeira.nome },
    unit: { id: c.unidade.id, name: c.unidade.nome },
  }
}

export function paraDentist(p: ProfissionalJson): Dentist {
  return {
    id: p.id,
    color: p.cor,
    cro: p.cro,
    specialty: p.especialidadeIds,
    user: { id: p.usuarioId ?? p.id, name: p.nome, email: null },
    units: p.unidades.map((u) => ({ unit_id: u.unidadeId, priority: u.prioridade })),
  }
}

export function paraProcedure(p: ProcedimentoJson): Procedure {
  return {
    id: p.id,
    name: p.nome,
    duration_minutes: p.duracaoMinutos,
    color: p.cor,
    // A especialidade vai pelo id, e o profissional também: a comparação continua valendo.
    required_specialty: p.especialidadeId ? [p.especialidadeId] : null,
  }
}

export const paraUnit = (u: UnidadeJson): Unit => ({ id: u.id, name: u.nome, address: u.endereco, phone: u.telefone })

export function paraScheduleBlock(b: BloqueioJson): ScheduleBlock {
  return { id: b.id, dentist_id: b.profissionalId, unit_id: b.unidadeId ?? '', start_at: b.inicio, end_at: b.fim, type: BLOQUEIO_PARA_TELA[b.tipo] }
}

export function paraDentistSchedule(profissionalId: string, e: ExpedienteJson, i: number): DentistSchedule {
  return {
    id: `${profissionalId}-${e.unidadeId}-${e.diaSemana}-${i}`,
    dentist_id: profissionalId,
    unit_id: e.unidadeId,
    day_of_week: e.diaSemana,
    start_time: e.inicio,
    end_time: e.fim,
  }
}
