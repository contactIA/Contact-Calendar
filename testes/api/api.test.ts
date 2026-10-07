import { describe, expect, it } from 'vitest'
import { criarApi, ORIGENS_DA_DOCUMENTACAO } from '@/api/app'
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
})
