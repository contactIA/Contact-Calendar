import type { AvisoAoCrm } from '@/compartilhado/vocabulario'

// As portas da ligação com o CRM (ADR 0001, fase 7). Os adaptadores ficam em
// ../infraestrutura; a composição liga cada porta ao seu.

/** O card como o CRM devolve, só com o que a agenda usa. */
export interface CardNoCrm {
  id: string
  /** A chave da coluna (`agendados`, `cancelados`...). */
  etapa: string
  agendadoPara: Date | null
}

/**
 * A API v1 do CRM, com a chave da agenda. Cada chamada leva o `companyId` da
 * clínica no `X-Clinica`. A recusa vem como ErroDoCrm, com o código do CRM.
 */
export interface ApiDoCrm {
  /** `POST /cards`: cria, reabre ou devolve o card aberto do contato (`ja_aberto`). */
  criarCard(companyId: string, pedido: { telefone: string; nome: string; unidadeId: string | null; etapa: string }): Promise<CardNoCrm>
  /** `GET /cards/do-contato`: o card aberto do telefone, sem criar; `null` sem card aberto. */
  cardAbertoDoContato(companyId: string, telefone: string): Promise<CardNoCrm | null>
  /** `POST /cards/{id}/mover`. */
  mover(companyId: string, cardId: string, pedido: { etapa: string; agendadoPara?: Date; agendadoEm?: Date }): Promise<void>
  /** `POST /cards/{id}/compareceu`. */
  compareceu(companyId: string, cardId: string): Promise<void>
}

/** Um aviso ao CRM reservado para entrega, com o que ela precisa saber agora. */
export interface AvisoAoCrmReservado {
  id: number
  clinicaId: string
  companyId: string
  tipo: AvisoAoCrm
  consultaId: string | null
  tentativas: number
  criadoEm: Date
  telefone: string
  nome: string
  /** O início da consulta, como estava quando o aviso foi gravado. */
  inicio: Date
  unidadeCrmId: string | null
  /** O card que a consulta já tem no CRM (de uma entrega anterior). */
  cardId: string | null
  /** A próxima consulta ativa do mesmo telefone, no instante da entrega. */
  proximaConsulta: Date | null
}

/** O que a entrega deixou: o card e, quando não mexeu nele, o porquê. */
export interface ResultadoDaEntrega {
  cardId: string | null
  ignorado?: string
}

export interface CaixaDoCrm {
  /**
   * Reserva os avisos ao CRM vencidos, na ordem, até `reservarAte`: dois workers
   * não pegam o mesmo. Um aviso só sai depois que o anterior da mesma consulta
   * terminou.
   */
  reservar(agora: Date, reservarAte: Date, limite: number): Promise<AvisoAoCrmReservado[]>
  /** Entregue: guarda o resultado e o card na consulta. */
  concluir(aviso: AvisoAoCrmReservado, agora: Date, resultado: ResultadoDaEntrega): Promise<void>
  /** Falhou, mas tenta de novo em `proxima`. */
  adiar(id: number, tentativas: number, proxima: Date, erro: string): Promise<void>
  /** Falhou de vez. */
  desistir(id: number, tentativas: number, erro: string): Promise<void>
}
