// Os avisos que o webhook do CRM manda à agenda (ADR 0001, fase 7b): a
// assinatura, e o que cada aviso pede. Puro: o instante entra por parâmetro, e o
// HMAC é calculado fora (infraestrutura).

/** Quanto a assinatura pode ter de idade: o CRM assina na hora de mandar, e a rede atrasa pouco. */
export const TOLERANCIA_DA_ASSINATURA_S = 10 * 60

/** `X-CRM-Assinatura: t=<segundos>,v1=<hex>`, onde v1 = HMAC-SHA256(segredo, "<t>.<corpo>"). */
export function lerAssinatura(cabecalho: string | null | undefined): { t: number; v1: string } | null {
  if (!cabecalho) return null
  const partes = Object.fromEntries(
    cabecalho.split(',').map((p) => {
      const i = p.indexOf('=')
      return i < 0 ? [p.trim(), ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    })
  )
  const t = Number(partes.t)
  const v1 = partes.v1
  if (!Number.isInteger(t) || t <= 0 || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return null
  return { t, v1: v1.toLowerCase() }
}

export function assinaturaNoPrazo(t: number, agora: Date): boolean {
  return Math.abs(agora.getTime() / 1000 - t) <= TOLERANCIA_DA_ASSINATURA_S
}

/** O corpo do aviso do CRM, só com o que a agenda lê (AvisoDeWebhook na API do CRM). */
export interface AvisoDoCrm {
  /** O número da entrega: repetido, é o mesmo aviso. */
  id: number
  evento: string
  /** O tipo exato do histórico: `movido`, `campo_alterado`, `passou_para_crc2`... */
  tipo: string
  clinica: { id: string; companyId: string }
  card: { id: string } | null
  para: { chave: string } | null
  ator: { tipo: string; id: string | null } | null
  dados: Record<string, unknown> | null
}

/** Confere a forma do corpo; o que não for um aviso do CRM é `null`. */
export function lerAviso(corpo: unknown): AvisoDoCrm | null {
  if (!corpo || typeof corpo !== 'object') return null
  const a = corpo as Record<string, unknown>
  const clinica = a.clinica as Record<string, unknown> | undefined
  if (typeof a.id !== 'number' || typeof a.evento !== 'string' || typeof a.tipo !== 'string') return null
  if (!clinica || typeof clinica.companyId !== 'string' || typeof clinica.id !== 'string') return null
  const card = a.card as Record<string, unknown> | null | undefined
  const para = a.para as Record<string, unknown> | null | undefined
  const ator = a.ator as Record<string, unknown> | null | undefined
  return {
    id: a.id,
    evento: a.evento,
    tipo: a.tipo,
    clinica: { id: clinica.id, companyId: clinica.companyId },
    card: card && typeof card.id === 'string' ? { id: card.id } : null,
    para: para && typeof para.chave === 'string' ? { chave: para.chave } : null,
    ator: ator && typeof ator.tipo === 'string' ? { tipo: ator.tipo, id: typeof ator.id === 'string' ? ator.id : null } : null,
    dados: a.dados && typeof a.dados === 'object' ? (a.dados as Record<string, unknown>) : null,
  }
}

/** O status que a consulta ligada ao card ganha quando o card sai de Agendados. */
export type SaidaDoCard = 'cancelada' | 'faltou' | 'concluida'

/**
 * O que o aviso pede à agenda. O aviso só diz QUANDO olhar; o que fazer sai do
 * card como ele está agora (lido na hora pela API do CRM), para que um aviso
 * atrasado ou repetido não desfaça o que veio depois.
 *
 *   · `agendamento`: o card foi criado ou andou (entrou em Agendados, saiu para
 *     outra coluna, foi para Perda), mudou de data, ou a consulta da Clinicorp
 *     foi registrada: conferir o agendamento. Em Agendados, a consulta ligada
 *     acompanha a data; fora, só a vinda pendente sai da lista;
 *   · `saida`: o card foi para Cancelados, Faltosos ou passou ao CRC2
 *     (compareceu): a consulta ligada acompanha;
 *   · `null`: nada que a agenda use (anotação, etiqueta, outro campo...).
 */
export type PedidoDoAviso = { tipo: 'agendamento' } | { tipo: 'saida'; saida: SaidaDoCard } | null

const SAIDA_DA_COLUNA: Record<string, SaidaDoCard> = { cancelados: 'cancelada', faltosos: 'faltou' }

/** Os movimentos do card no histórico do CRM (os do evento `card.movido`). */
const MOVIMENTOS = new Set(['movido', 'reaberto', 'saida_desfeita', 'perdido', 'ganho', 'nao_e_lead', 'passou_de_painel'])

export function pedidoDoAviso(aviso: AvisoDoCrm): PedidoDoAviso {
  if (!aviso.card) return null
  if (aviso.tipo === 'passou_para_crc2') return { tipo: 'saida', saida: 'concluida' }
  if (MOVIMENTOS.has(aviso.tipo)) {
    const saida = aviso.para ? SAIDA_DA_COLUNA[aviso.para.chave] : undefined
    return saida ? { tipo: 'saida', saida } : { tipo: 'agendamento' }
  }
  switch (aviso.tipo) {
    case 'criado':
    case 'consulta_no_prontuario':
      return { tipo: 'agendamento' }
    case 'campo_alterado':
      return aviso.dados?.campo === 'agendadoPara' ? { tipo: 'agendamento' } : null
    default:
      return null
  }
}

/** A coluna em que o card precisa estar para a saída valer (a lida agora no CRM). */
export function saidaVale(saida: SaidaDoCard, card: { painel: string; etapa: string }): boolean {
  if (saida === 'concluida') return card.painel !== 'crc1'
  return card.etapa === (saida === 'cancelada' ? 'cancelados' : 'faltosos')
}
