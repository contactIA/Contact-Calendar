// Os valores de lista fechada da agenda, num lugar só (docs/modelo-de-dados.md).
// O domínio usa os tipos, e o esquema do banco gera os `check` a partir destas
// listas: um valor novo entra aqui e numa migração, e os dois não divergem.

/** De quanto em quanto tempo a grade oferece um início de consulta. */
export const CADENCIAS_DA_GRADE = [5, 10, 15, 20, 30, 60] as const
export type CadenciaDaGrade = (typeof CADENCIAS_DA_GRADE)[number]

export const STATUS_DA_CONSULTA = ['agendada', 'confirmada', 'em_atendimento', 'concluida', 'cancelada', 'faltou'] as const
export type StatusDaConsulta = (typeof STATUS_DA_CONSULTA)[number]

/**
 * As consultas que ocupam o horário do profissional, da cadeira e do paciente.
 * A cancelada e a falta liberam. As restrições de exclusão do banco usam esta
 * mesma lista (drizzle/0001_regras_de_horario.sql), e um teste confere.
 */
export const STATUS_QUE_OCUPAM_HORARIO = ['agendada', 'confirmada', 'em_atendimento', 'concluida'] as const

export const TIPOS_DE_BLOQUEIO = ['ausencia', 'intervalo', 'reuniao', 'reservado'] as const
export type TipoDeBloqueio = (typeof TIPOS_DE_BLOQUEIO)[number]

/** Quem fez: uma pessoa pela tela, o agente de IA, uma integração ou o próprio sistema. */
export const TIPOS_DE_ATOR = ['usuario', 'ia', 'integracao', 'sistema'] as const
export type TipoDeAtor = (typeof TIPOS_DE_ATOR)[number]

export const TIPOS_DE_CHAVE_API = ['ia', 'integracao'] as const
export type TipoDeChaveApi = (typeof TIPOS_DE_CHAVE_API)[number]

export const TIPOS_DE_EVENTO = [
  'consulta_criada',
  'consulta_remarcada',
  'status_mudou',
  'consulta_alterada',
  'paciente_criado',
  'paciente_alterado',
] as const
export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number]

// ── Caixa de saída ───────────────────────────────────────────────────────────

export const DESTINOS_DE_AVISO = ['crm', 'plataforma'] as const
export type DestinoDeAviso = (typeof DESTINOS_DE_AVISO)[number]

/** O que a agenda avisa ao CRM, para mover o card do paciente. */
export const AVISOS_AO_CRM = ['consulta_criada', 'consulta_remarcada', 'consulta_cancelada', 'paciente_faltou', 'paciente_compareceu'] as const
export type AvisoAoCrm = (typeof AVISOS_AO_CRM)[number]

/** O que a agenda faz na plataforma de mensagens. */
export const ACOES_NA_PLATAFORMA = ['enviar_confirmacao', 'agendar_lembrete', 'cancelar_lembrete', 'sincronizar_contato', 'etiquetar_contato'] as const
export type AcaoNaPlataforma = (typeof ACOES_NA_PLATAFORMA)[number]

/** `falhou` é desistir depois das tentativas; `concluido` é entregue ou feito. */
export const SITUACOES_DE_AVISO = ['pendente', 'concluido', 'falhou'] as const
export type SituacaoDeAviso = (typeof SITUACOES_DE_AVISO)[number]
