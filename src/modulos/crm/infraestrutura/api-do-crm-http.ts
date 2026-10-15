import type { ApiDoCrm, CardDetalhadoNoCrm, CardNoCrm } from '../aplicacao/portas'
import { ErroDoCrm } from '../dominio/entrega'

// A API v1 do CRM pela rede (ADR 0001, decisão D4 do modelo): uma chave do CRM
// para a agenda, no .env, com acesso a todas as clínicas, e o `X-Clinica` com o
// companyId da clínica em cada chamada.

export interface ConfiguracaoDoCrm {
  /** CRM_URL, sem a barra no fim (ex.: https://crm.contactia.com.br). */
  url: string
  /** CRM_CHAVE: a chave `crm_...` da agenda, do tipo integração, com escrita. */
  chave: string
  tempoLimiteMs?: number
  fetch?: typeof fetch
}

/** A configuração do .env, ou `null` sem ela: aí a entrega fica parada e os avisos esperam. */
export function lerConfiguracaoDoCrm(env: Record<string, string | undefined> = process.env): ConfiguracaoDoCrm | null {
  const url = env.CRM_URL?.trim().replace(/\/+$/, '')
  const chave = env.CRM_CHAVE?.trim()
  return url && chave ? { url, chave } : null
}

interface CardDaApi {
  id: string
  painel: string
  situacao: string
  etapa: { chave: string }
  agendadoPara: string | null
  unidade: { id: string } | null
  contato: { nome: string | null; telefone: string }
}

interface ConsultaDaApi {
  situacao: string
  inicio: string
  fim: string | null
  unidadeId: string
  profissional: { id: string; nome: string } | null
}

const paraCard = (c: CardDaApi): CardNoCrm => ({
  id: c.id,
  etapa: c.etapa.chave,
  agendadoPara: c.agendadoPara ? new Date(c.agendadoPara) : null,
})

const paraCardDetalhado = (c: CardDaApi): CardDetalhadoNoCrm => ({
  ...paraCard(c),
  painel: c.painel,
  situacao: c.situacao,
  unidadeId: c.unidade?.id ?? null,
  contato: { nome: c.contato.nome, telefone: c.contato.telefone },
})

export function apiDoCrmHttp({ url, chave, tempoLimiteMs = 10_000, fetch: buscar = fetch }: ConfiguracaoDoCrm): ApiDoCrm {
  async function pedir<T>(companyId: string, metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<T | null> {
    let resposta: Response
    try {
      resposta = await buscar(`${url}/api/v1${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${chave}`,
          'X-Clinica': companyId,
          ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempoLimiteMs),
        redirect: 'manual',
      })
    } catch (erro) {
      throw new ErroDoCrm(0, null, `O CRM não respondeu: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
    if (resposta.status === 204) return null
    const texto = await resposta.text()
    let json: unknown = null
    try {
      json = texto ? JSON.parse(texto) : null
    } catch {
      // Uma página de erro do proxy, sem JSON: fica o status.
    }
    if (!resposta.ok) {
      const { erro, codigo } = (json ?? {}) as { erro?: string; codigo?: string }
      throw new ErroDoCrm(resposta.status, codigo ?? null, `CRM ${resposta.status}${codigo ? ` ${codigo}` : ''}: ${erro ?? texto.slice(0, 200)}`)
    }
    return json as T
  }

  return {
    async criarCard(companyId, pedido) {
      const r = await pedir<{ card: CardDaApi }>(companyId, 'POST', '/cards', pedido)
      return paraCard(r!.card)
    },

    async cardAbertoDoContato(companyId, telefone) {
      try {
        const r = await pedir<CardDaApi>(companyId, 'GET', `/cards/do-contato?telefone=${encodeURIComponent(telefone)}`)
        return paraCard(r!)
      } catch (erro) {
        if (erro instanceof ErroDoCrm && erro.codigo === 'SEM_CARD_ABERTO') return null
        throw erro
      }
    },

    async mover(companyId, cardId, { etapa, agendadoPara, agendadoEm }) {
      await pedir(companyId, 'POST', `/cards/${encodeURIComponent(cardId)}/mover`, {
        etapa,
        ...(agendadoPara ? { agendadoPara: agendadoPara.toISOString() } : {}),
        ...(agendadoEm ? { agendadoEm: agendadoEm.toISOString() } : {}),
      })
    },

    async compareceu(companyId, cardId) {
      await pedir(companyId, 'POST', `/cards/${encodeURIComponent(cardId)}/compareceu`, {})
    },

    async quemSou(companyId) {
      const eu = await pedir<{ id: string | null }>(companyId, 'GET', '/eu')
      return { id: eu?.id ?? null }
    },

    async card(companyId, cardId) {
      return paraCardDetalhado((await pedir<CardDaApi>(companyId, 'GET', `/cards/${encodeURIComponent(cardId)}`))!)
    },

    async consultasNoProntuario(companyId, cardId) {
      const r = await pedir<{ consultas: ConsultaDaApi[] }>(companyId, 'GET', `/cards/${encodeURIComponent(cardId)}/consultas`)
      return (r?.consultas ?? []).map((c) => ({
        situacao: c.situacao,
        inicio: new Date(c.inicio),
        fim: c.fim ? new Date(c.fim) : null,
        unidadeId: c.unidadeId,
        profissional: c.profissional,
      }))
    },

    async criarWebhook(companyId, pedido) {
      const r = await pedir<{ id: string; segredo: string }>(companyId, 'POST', '/webhooks', pedido)
      return { id: r!.id, segredo: r!.segredo }
    },

    async apagarWebhook(companyId, webhookId) {
      try {
        await pedir(companyId, 'DELETE', `/webhooks/${encodeURIComponent(webhookId)}`)
      } catch (erro) {
        if (erro instanceof ErroDoCrm && erro.status === 404) return
        throw erro
      }
    },
  }
}
