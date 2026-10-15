import type { ApiDoCrm, CardDetalhadoNoCrm, CardNoCrm, ConsultaNoProntuario } from '@/modulos/crm/aplicacao/portas'
import { ErroDoCrm } from '@/modulos/crm/dominio/entrega'

// Um CRM de mentira, que se comporta como a API v1 no que a agenda usa: um card
// aberto por telefone, as recusas com o código, as consultas da Clinicorp de cada
// card e o webhook da clínica. Guarda as chamadas, para o teste conferir.

export interface CardFalso extends CardNoCrm {
  telefone: string
  nome: string | null
  painel: string
  aberto: boolean
  unidadeId: string | null
}

export const CHAVE_DA_AGENDA = 'chave-da-agenda'

export function crmDeMentira() {
  const cards = new Map<string, CardFalso>()
  const consultas = new Map<string, ConsultaNoProntuario[]>()
  const webhooks = new Map<string, { url: string; eventos: readonly string[] }>()
  const chamadas: string[] = []
  let falha: ErroDoCrm | null = null
  const hora = (d?: Date) => (d ? ` ${d.toISOString()}` : '')
  const abertoDo = (telefone: string) => [...cards.values()].find((c) => c.telefone === telefone && c.aberto)
  const doCard = (c: CardFalso): CardNoCrm => ({ id: c.id, etapa: c.etapa, agendadoPara: c.agendadoPara })
  const conferir = (id: string) => {
    const card = cards.get(id)
    if (!card) throw new ErroDoCrm(404, 'CARD_NAO_ENCONTRADO', 'Card não encontrado')
    if (!card.aberto) throw new ErroDoCrm(409, 'CARD_NAO_ESTA_ABERTO', 'O card não está aberto')
    return card
  }
  const falhar = () => {
    if (falha) throw falha
  }

  const api: ApiDoCrm = {
    async criarCard(companyId, pedido) {
      chamadas.push(`criar ${pedido.etapa}`)
      falhar()
      const aberto = abertoDo(pedido.telefone)
      if (aberto) return doCard(aberto)
      const card: CardFalso = {
        id: crypto.randomUUID(),
        etapa: pedido.etapa,
        agendadoPara: null,
        telefone: pedido.telefone,
        nome: pedido.nome,
        painel: 'crc1',
        aberto: true,
        unidadeId: pedido.unidadeId,
      }
      cards.set(card.id, card)
      return doCard(card)
    },
    async cardAbertoDoContato(companyId, telefone) {
      chamadas.push('do-contato')
      falhar()
      const aberto = abertoDo(telefone)
      return aberto ? doCard(aberto) : null
    },
    async mover(companyId, cardId, pedido) {
      chamadas.push(`mover ${pedido.etapa}${hora(pedido.agendadoPara)}${pedido.agendadoEm ? ' (com agendadoEm)' : ''}`)
      falhar()
      const card = conferir(cardId)
      if (card.painel !== 'crc1') throw new ErroDoCrm(400, 'MOVER_ENTRE_PAINEIS', 'Outro painel')
      card.etapa = pedido.etapa
      if (pedido.agendadoPara) card.agendadoPara = pedido.agendadoPara
    },
    async compareceu(companyId, cardId) {
      chamadas.push('compareceu')
      falhar()
      const card = conferir(cardId)
      if (card.painel === 'crc2') throw new ErroDoCrm(409, 'JA_ESTA_EM_OUTRO_PAINEL', 'Já está no CRC2')
      card.painel = 'crc2'
      card.etapa = 'avaliacao'
    },
    async quemSou() {
      chamadas.push('eu')
      falhar()
      return { id: CHAVE_DA_AGENDA }
    },
    async card(companyId, cardId): Promise<CardDetalhadoNoCrm> {
      chamadas.push('card')
      falhar()
      const c = cards.get(cardId)
      if (!c) throw new ErroDoCrm(404, 'CARD_NAO_ENCONTRADO', 'Card não encontrado')
      return { ...doCard(c), painel: c.painel, situacao: c.aberto ? 'aberto' : 'perdido', unidadeId: c.unidadeId, contato: { nome: c.nome, telefone: c.telefone } }
    },
    async consultasNoProntuario(companyId, cardId) {
      chamadas.push('consultas')
      falhar()
      return consultas.get(cardId) ?? []
    },
    async criarWebhook(companyId, pedido) {
      chamadas.push(`criar webhook ${pedido.url}`)
      falhar()
      const id = crypto.randomUUID()
      webhooks.set(id, { url: pedido.url, eventos: pedido.eventos })
      return { id, segredo: 'whsec_teste' }
    },
    async unidades() {
      chamadas.push('unidades')
      falhar()
      return [{ id: 'unidade-do-crm', nome: 'Centro', ativa: true }]
    },
    async apagarWebhook(companyId, webhookId) {
      chamadas.push('apagar webhook')
      falhar()
      webhooks.delete(webhookId)
    },
  }

  return {
    api,
    cards,
    consultas,
    webhooks,
    chamadas,
    falhar(erro: ErroDoCrm | null) {
      falha = erro
    },
    /** Um card como o CRM teria, criado direto lá (pela CRC, pelo botão, pela IA). */
    novoCard(dados: Partial<CardFalso> & { telefone: string }): CardFalso {
      const card: CardFalso = { id: crypto.randomUUID(), etapa: 'agendados', agendadoPara: null, nome: null, painel: 'crc1', aberto: true, unidadeId: null, ...dados }
      cards.set(card.id, card)
      return card
    },
    limpar() {
      cards.clear()
      consultas.clear()
      webhooks.clear()
      chamadas.length = 0
      falha = null
    },
  }
}
