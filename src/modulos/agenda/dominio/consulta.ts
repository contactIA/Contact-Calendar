import { ErroDeDominio } from '@/compartilhado/erros'
import type { AvisoAoCrm, StatusDaConsulta, TipoDeAtor } from '@/compartilhado/vocabulario'

// A consulta e o ciclo dela (docs/modelo-de-dados.md, "Pacientes e consultas").
//
//   agendada ──► confirmada ──► em_atendimento ──► concluida
//      │   └──────────┴──────────────┘ (chegou)        ▲
//      │              └───────────────────────────────┘ (concluída direto)
//      └──► cancelada · faltou   (da agendada ou da confirmada)
//
// Concluída, cancelada e falta são finais. Para voltar, a recepção marca outra
// consulta: no CRM, isso é o "reagendou" que tira o card de Cancelados ou Faltosos.

export interface Consulta {
  id: string
  clinicaId: string
  unidadeId: string
  cadeiraId: string
  profissionalId: string
  pacienteId: string
  procedimentoId: string
  inicio: Date
  fim: Date
  status: StatusDaConsulta
  observacoes: string | null
  criadaPorTipo: TipoDeAtor
  criadaPorId: string | null
  canceladaEm: Date | null
  motivoCancelamento: string | null
  crmCardId: string | null
  versao: number
}

const TRANSICOES: Record<StatusDaConsulta, readonly StatusDaConsulta[]> = {
  agendada: ['confirmada', 'em_atendimento', 'concluida', 'cancelada', 'faltou'],
  confirmada: ['em_atendimento', 'concluida', 'cancelada', 'faltou'],
  em_atendimento: ['concluida'],
  concluida: [],
  cancelada: [],
  faltou: [],
}

export const REMARCAVEIS: readonly StatusDaConsulta[] = ['agendada', 'confirmada']

/** Quem pede, do jeito que a regra da consulta precisa ver. */
export type QuemMuda =
  | { tipo: 'usuario'; cuidaDaAgenda: boolean; dentista: boolean; profissionalId: string | null }
  | { tipo: 'ia' | 'integracao' | 'sistema' }

/**
 * O que cada um pode marcar:
 *   · a recepção, o gestor e o sistema: tudo o que o ciclo deixa;
 *   · o dentista: chegada e atendimento, só das consultas dele;
 *   · a chave do agente e das integrações: confirmar e cancelar (o paciente responde
 *     ao lembrete pelo WhatsApp). Decidido na construção: a agenda antiga só
 *     deixava a IA cancelar.
 */
function podeMarcar(quem: QuemMuda, consulta: Consulta, para: StatusDaConsulta): boolean {
  switch (quem.tipo) {
    case 'sistema':
      return true
    case 'ia':
    case 'integracao':
      return para === 'confirmada' || para === 'cancelada'
    case 'usuario':
      if (quem.cuidaDaAgenda) return true
      return quem.dentista && quem.profissionalId === consulta.profissionalId && (para === 'em_atendimento' || para === 'concluida')
  }
}

/** Confere a mudança de status e devolve a consulta como fica. */
export function mudarStatus(
  consulta: Consulta,
  para: StatusDaConsulta,
  quem: QuemMuda,
  agora: Date,
  motivo?: string | null
): Consulta {
  if (consulta.status === para) {
    throw new ErroDeDominio('conflito', 'STATUS_IGUAL', 'A consulta já está com esse status')
  }
  if (!TRANSICOES[consulta.status].includes(para)) {
    throw new ErroDeDominio('conflito', 'MUDANCA_DE_STATUS_INVALIDA', `Uma consulta ${rotulo(consulta.status)} não pode ficar ${rotulo(para)}`)
  }
  if (!podeMarcar(quem, consulta, para)) {
    throw new ErroDeDominio('proibido', 'STATUS_PROIBIDO', `Seu acesso não pode marcar a consulta como ${rotulo(para)}`)
  }
  return {
    ...consulta,
    status: para,
    canceladaEm: para === 'cancelada' ? agora : null,
    motivoCancelamento: para === 'cancelada' ? motivo?.trim() || null : null,
  }
}

/** A consulta só se remarca enquanto está marcada; depois de cancelada ou falta, marca-se outra. */
export function exigirRemarcavel(consulta: Consulta): void {
  if (!REMARCAVEIS.includes(consulta.status)) {
    throw new ErroDeDominio('conflito', 'CONSULTA_NAO_REMARCAVEL', `Uma consulta ${rotulo(consulta.status)} não se remarca: marque outra`)
  }
}

/**
 * O aviso ao CRM, que move o card do paciente. A agenda não manda mensagem (fase
 * 7c): a confirmação e o lembrete saem pelo CRM, pela data do card.
 */
export type Aviso = { destino: 'crm'; tipo: AvisoAoCrm }

/**
 * O que a mudança de status precisa avisar ao CRM. O caso de uso tira o que a
 * clínica não configurou (CRM desligado, sem telefone). O "compareceu" sai uma vez
 * só: quando o paciente chega, ou quando a consulta é concluída direto.
 */
export function avisosDaMudanca(de: StatusDaConsulta, para: StatusDaConsulta): Aviso[] {
  if (para === 'cancelada') return [{ destino: 'crm', tipo: 'consulta_cancelada' }]
  if (para === 'faltou') return [{ destino: 'crm', tipo: 'paciente_faltou' }]
  const chegou = (para === 'em_atendimento' || para === 'concluida') && (de === 'agendada' || de === 'confirmada')
  return chegou ? [{ destino: 'crm', tipo: 'paciente_compareceu' }] : []
}

export function avisosDoAgendamento(): Aviso[] {
  return [{ destino: 'crm', tipo: 'consulta_criada' }]
}

export function avisosDaRemarcacao(): Aviso[] {
  return [{ destino: 'crm', tipo: 'consulta_remarcada' }]
}

const ROTULOS: Record<StatusDaConsulta, string> = {
  agendada: 'agendada',
  confirmada: 'confirmada',
  em_atendimento: 'em atendimento',
  concluida: 'concluída',
  cancelada: 'cancelada',
  faltou: 'com falta',
}

export const rotulo = (status: StatusDaConsulta) => ROTULOS[status]
