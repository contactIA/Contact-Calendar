import type { AvisoAoCrm } from '@/compartilhado/vocabulario'

// Regras da entrega dos avisos ao CRM (ADR 0001, fase 7): o que o card deve
// mostrar depois de cada aviso, o que cada recusa do CRM quer dizer e quando
// tentar de novo. Puro: o instante entra por parâmetro.

/** Intervalos entre as tentativas, como os webhooks do CRM: 30 s, 2 min, 10 min, 30 min, 1 h, 3 h, 6 h, 12 h. */
export const ESPERAS_ENTRE_TENTATIVAS_S = [30, 120, 600, 1800, 3600, 10800, 21600, 43200] as const

/** Quando tentar de novo, ou `null` quando acabaram as tentativas. */
export function proximaTentativa(tentativasFeitas: number, agora: Date): Date | null {
  const espera = ESPERAS_ENTRE_TENTATIVAS_S[tentativasFeitas - 1]
  return espera === undefined ? null : new Date(agora.getTime() + espera * 1000)
}

/** As colunas do CRC1 que a agenda usa, pela chave. */
export const ETAPAS_DO_CRM = { agendados: 'agendados', cancelados: 'cancelados', faltosos: 'faltosos' } as const

/**
 * O que fazer com o card. O card mostra a PRÓXIMA consulta ativa do telefone na
 * agenda (agendada ou confirmada, no futuro), porque o CRM tem um card por
 * contato e a família divide o número:
 *
 *   · criar e remarcar põem o card em Agendados com a data da próxima consulta
 *     (a desta, se ela for a próxima ou se não houver nenhuma no futuro);
 *   · cancelar e faltar só tiram o card de Agendados quando não sobra outra
 *     consulta; se sobra, ele fica em Agendados com a data dela;
 *   · o comparecimento passa o card para o CRC2 sempre.
 */
export type PassoNoCrm =
  | { tipo: 'agendar'; agendadoPara: Date }
  | { tipo: 'sair'; etapa: typeof ETAPAS_DO_CRM.cancelados | typeof ETAPAS_DO_CRM.faltosos }
  | { tipo: 'compareceu' }

export function passoDoAviso(tipo: AvisoAoCrm, inicioDaConsulta: Date, proximaConsulta: Date | null): PassoNoCrm {
  switch (tipo) {
    case 'paciente_compareceu':
      return { tipo: 'compareceu' }
    case 'consulta_criada':
    case 'consulta_remarcada':
      return { tipo: 'agendar', agendadoPara: proximaConsulta ?? inicioDaConsulta }
    case 'consulta_cancelada':
      return proximaConsulta ? { tipo: 'agendar', agendadoPara: proximaConsulta } : { tipo: 'sair', etapa: ETAPAS_DO_CRM.cancelados }
    case 'paciente_faltou':
      return proximaConsulta ? { tipo: 'agendar', agendadoPara: proximaConsulta } : { tipo: 'sair', etapa: ETAPAS_DO_CRM.faltosos }
  }
}

/** A recusa do CRM (`{ erro, codigo }` com o status), ou a falta de resposta (status 0). */
export class ErroDoCrm extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string | null,
    mensagem: string
  ) {
    super(mensagem)
    this.name = 'ErroDoCrm'
  }
}

/** O card guardado não serve mais (fechado ou apagado): acha-se ou cria-se o aberto. */
const CARD_FORA = new Set(['CARD_NAO_ESTA_ABERTO', 'CARD_NAO_ENCONTRADO'])

/** O card está onde a agenda não mexe (no CRC2, em outro painel): a entrega termina sem mudar nada. */
const NADA_A_FAZER = new Set(['MOVER_ENTRE_PAINEIS', 'JA_ESTA_EM_OUTRO_PAINEL'])

export function cardFora(erro: unknown): erro is ErroDoCrm {
  return erro instanceof ErroDoCrm && erro.codigo !== null && CARD_FORA.has(erro.codigo)
}

export function nadaAFazer(erro: unknown): erro is ErroDoCrm {
  return erro instanceof ErroDoCrm && erro.codigo !== null && NADA_A_FAZER.has(erro.codigo)
}

/**
 * Tentar de novo vale para o que passa sozinho: a rede, o CRM fora do ar, o
 * limite de pedidos e a chave recusada (a equipe corrige o .env ou o setup). O
 * pedido recusado por uma regra não muda repetindo: a entrega desiste na hora.
 */
export function vaiPassarSozinho(erro: unknown): boolean {
  if (!(erro instanceof ErroDoCrm)) return true
  const { status } = erro
  return status === 0 || status >= 500 || status === 401 || status === 403 || status === 408 || status === 429
}
