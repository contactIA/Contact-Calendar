import type { AvisoAoCrm, EventoDoCrm } from '@/compartilhado/vocabulario'

// As portas da ligação com o CRM (ADR 0001, fase 7). Os adaptadores ficam em
// ../infraestrutura; a composição liga cada porta ao seu.

/** O card como o CRM devolve, só com o que a agenda usa. */
export interface CardNoCrm {
  id: string
  /** A chave da coluna (`agendados`, `cancelados`...). */
  etapa: string
  agendadoPara: Date | null
}

/** O card lido inteiro (`GET /cards/{id}`), para a entrada decidir pelo estado de agora. */
export interface CardDetalhadoNoCrm extends CardNoCrm {
  /** A chave do painel (`crc1`, `crc2`...). */
  painel: string
  situacao: string
  unidadeId: string | null
  contato: { nome: string | null; telefone: string }
}

/** A consulta que o CRM marcou ou acompanha na Clinicorp (`GET /cards/{id}/consultas`). */
export interface ConsultaNoProntuario {
  situacao: string
  inicio: Date
  fim: Date | null
  unidadeId: string
  profissional: { id: string; nome: string } | null
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
  /** `GET /eu`: o id da chave da agenda, para reconhecer os avisos que ela mesma causou. */
  quemSou(companyId: string): Promise<{ id: string | null }>
  /** `GET /cards/{id}`. */
  card(companyId: string, cardId: string): Promise<CardDetalhadoNoCrm>
  /** `GET /cards/{id}/consultas`, da mais nova para a mais antiga. */
  consultasNoProntuario(companyId: string, cardId: string): Promise<ConsultaNoProntuario[]>
  /** `POST /webhooks`: o webhook da clínica do `X-Clinica`. O segredo só volta aqui. */
  criarWebhook(companyId: string, pedido: { nome: string; url: string; eventos: readonly EventoDoCrm[] }): Promise<{ id: string; segredo: string }>
  /** `DELETE /webhooks/{id}`; o que já não existe não é erro. */
  apagarWebhook(companyId: string, webhookId: string): Promise<void>
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

// ── Entrada (fase 7b) ────────────────────────────────────────────────────────

/** Um aviso do CRM guardado, reservado para o worker processar. */
export interface EntradaReservada {
  id: number
  clinicaId: string
  companyId: string
  tentativas: number
  corpo: unknown
}

export interface EntradasDoCrm {
  /** Guarda o aviso; o repetido (a mesma entrega) não entra de novo. */
  guardar(
    clinicaId: string,
    entrada: { entregaId: number; evento: string; tipo: string; cardId: string | null; corpo: unknown },
    agora: Date
  ): Promise<'novo' | 'repetido'>
  /** Reserva os avisos vencidos, na ordem; um de cada vez por card. */
  reservar(agora: Date, reservarAte: Date, limite: number): Promise<EntradaReservada[]>
  concluir(id: number, situacao: 'processado' | 'ignorado', resultado: Record<string, unknown>, tentativas: number, agora: Date): Promise<void>
  adiar(id: number, tentativas: number, proxima: Date, erro: string): Promise<void>
  desistir(id: number, tentativas: number, erro: string): Promise<void>
}

/** A clínica vista pela ligação com o CRM. */
export interface ClinicaNoCrm {
  id: string
  companyId: string
  ligadaAoCrm: boolean
  webhookId: string | null
  segredoCifrado: string | null
}

export interface ClinicasNoCrm {
  obter(clinicaId: string): Promise<ClinicaNoCrm | null>
  peloCompanyId(companyId: string): Promise<ClinicaNoCrm | null>
  /** Liga: os avisos saem para o CRM e os dele entram pelo webhook. */
  ligar(clinicaId: string, webhookId: string, segredoCifrado: string): Promise<void>
  desligar(clinicaId: string): Promise<void>
}

/** A cifra do segredo do webhook (AES-256-GCM com a chave do .env). */
export interface Cifra {
  cifrar(texto: string): string
  decifrar(guardado: string): string
}

/** O HMAC-SHA256 da assinatura do aviso, em hex, e a comparação em tempo constante. */
export interface Assinador {
  hmacHex(segredo: string, texto: string): string
  iguais(a: string, b: string): boolean
}
