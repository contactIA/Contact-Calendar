import { describe, expect, it } from 'vitest'
import { criarApi, ORIGENS_DA_DOCUMENTACAO } from '@/api/app'
import { ErroDeDominio } from '@/compartilhado/erros'
import type { CasosDeUso } from '@/composicao'

// A API sem banco: os casos de uso entram de mentira, para testar só o HTTP.

const casosCom = (bancoResponde: () => Promise<boolean>) => () => ({ sistema: { bancoResponde } }) as CasosDeUso

describe('API', () => {
  it('a saúde responde 200 com o banco no ar', async () => {
    const api = criarApi(casosCom(async () => true))
    const resposta = await api.request('/api/v1/saude')
    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ ok: true, banco: 'ok' })
    expect(resposta.headers.get('Cache-Control')).toBe('no-store')
  })

  it('a saúde responde 503 quando o banco não responde ou nem há conexão', async () => {
    const fora = await criarApi(casosCom(async () => false)).request('/api/v1/saude')
    expect(fora.status).toBe(503)

    const semBanco = criarApi(() => {
      throw new Error('DATABASE_URL ausente')
    })
    const resposta = await semBanco.request('/api/v1/saude')
    expect(resposta.status).toBe(503)
    expect(await resposta.json()).toMatchObject({ ok: false, banco: 'fora' })
  })

  it('o contrato abre sem banco e documenta a saúde', async () => {
    const api = criarApi(() => {
      throw new Error('o contrato não usa os casos de uso')
    })
    const contrato = (await (await api.request('/api/openapi.json')).json()) as { openapi: string; paths: Record<string, unknown> }
    expect(contrato.openapi).toBe('3.1.0')
    expect(Object.keys(contrato.paths)).toContain('/api/v1/saude')
  })

  it('rota que não existe responde no formato de erro', async () => {
    const resposta = await criarApi(casosCom(async () => true)).request('/api/v1/nao-existe')
    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ erro: 'Rota não encontrada', codigo: 'ROTA_NAO_ENCONTRADA' })
  })

  it('o CORS libera só a origem da documentação', async () => {
    const api = criarApi(casosCom(async () => true))
    const daDocumentacao = await api.request('/api/v1/saude', { headers: { Origin: ORIGENS_DA_DOCUMENTACAO[0]! } })
    expect(daDocumentacao.headers.get('Access-Control-Allow-Origin')).toBe(ORIGENS_DA_DOCUMENTACAO[0])

    const deOutroLugar = await api.request('/api/v1/saude', { headers: { Origin: 'https://exemplo.com' } })
    expect(deOutroLugar.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('o aviso do CRM chega cru ao caso de uso, com o cabeçalho da assinatura; a recusa sai no formato de erro', async () => {
    const recebidos: [string, string | null][] = []
    const receberAviso = async (texto: string, assinatura: string | null) => {
      recebidos.push([texto, assinatura])
      if (!assinatura) throw new ErroDeDominio('nao_autenticado', 'ASSINATURA_INVALIDA', 'Falta a assinatura do CRM, ou ela não confere')
      return 'novo' as const
    }
    const api = criarApi(() => ({ crm: { receberAviso } }) as unknown as CasosDeUso)
    const corpo = '{"id":1,  "evento":"card.movido"}'
    const aceito = await api.request('/api/v1/crm/avisos', { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/json', 'X-CRM-Assinatura': 't=1,v1=ab' } })
    expect(aceito.status).toBe(200)
    expect(await aceito.json()).toEqual({ ok: true, resultado: 'novo' })
    expect(recebidos[0]).toEqual([corpo, 't=1,v1=ab'])

    const recusado = await api.request('/api/v1/crm/avisos', { method: 'POST', body: corpo })
    expect(recusado.status).toBe(401)
    expect(await recusado.json()).toEqual({ erro: 'Falta a assinatura do CRM, ou ela não confere', codigo: 'ASSINATURA_INVALIDA' })
  })

  it('as rotas da ligação com o CRM e das vindas ficam fora do contrato de quem integra', async () => {
    const api = criarApi(() => {
      throw new Error('o contrato não usa os casos de uso')
    })
    const contrato = (await (await api.request('/api/openapi.json')).json()) as { paths: Record<string, unknown> }
    expect(Object.keys(contrato.paths).filter((c) => c.includes('/crm/') || c.includes('/vindas'))).toEqual([])
  })
})
