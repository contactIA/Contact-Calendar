import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarApi } from '@/api/app'
import { montarCasosDeUso } from '@/composicao'
import type { Acesso } from '@/modulos/acesso/aplicacao/acesso'
import { montarClinicaDaAgenda, type ClinicaDaAgenda } from '../apoio/agenda'
import { bancoDeTeste, relogioDeTeste } from '../apoio/banco'

// A API de ponta a ponta: a chave criada pelo caso de uso, o HTTP do Hono e os
// adaptadores de verdade no PGlite. Agora é quarta, 07/10/2026, 9h em São Paulo.

let pg: PGlite
let casos: ReturnType<typeof montarCasosDeUso>
let api: ReturnType<typeof criarApi>
const relogio = relogioDeTeste(new Date('2026-10-07T12:00:00Z'))

beforeAll(async () => {
  const teste = await bancoDeTeste()
  pg = teste.pg
  casos = montarCasosDeUso({ banco: teste.banco, relogio })
  api = criarApi(() => casos)
}, 60_000)
afterAll(() => pg.close())

const gestorDa = (c: ClinicaDaAgenda): Acesso => ({
  tipo: 'usuario',
  clinicaId: c.clinica,
  usuarioId: crypto.randomUUID(),
  nome: 'Gestora',
  papeis: { gestor: true, recepcao: false, dentista: false },
  profissionalId: null,
})

async function clinicaComChave(podeEscrever = true) {
  const c = await montarClinicaDaAgenda(pg)
  const { chave } = await casos.acesso.criarChave(gestorDa(c), { nome: 'Agente', tipo: 'ia', podeEscrever })
  const pedir = (caminho: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    api.request(`/api/v1${caminho}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  return { c, chave, pedir }
}

describe('autenticação', () => {
  it('sem chave é 401; chave errada também', async () => {
    const semChave = await api.request('/api/v1/unidades')
    expect(semChave.status).toBe(401)
    expect(await semChave.json()).toMatchObject({ codigo: 'SEM_CREDENCIAL' })
    const errada = await api.request('/api/v1/unidades', { headers: { Authorization: 'Bearer agd_errada' } })
    expect(errada.status).toBe(401)
  })

  it('o X-Clinica de outra clínica é 403', async () => {
    const { pedir } = await clinicaComChave()
    const outra = await montarClinicaDaAgenda(pg)
    const resposta = await pedir('/unidades', { headers: { 'X-Clinica': outra.clinica } })
    expect(resposta.status).toBe(403)
    expect(await resposta.json()).toMatchObject({ codigo: 'CLINICA_FORA_DA_CHAVE' })
  })

  it('a chave lê os cadastros, mas não cadastra', async () => {
    const { pedir } = await clinicaComChave()
    const unidades = (await (await pedir('/unidades')).json()) as { unidades: { nome: string }[] }
    expect(unidades.unidades.map((u) => u.nome)).toEqual(['Bairro', 'Centro'])
    const criar = await pedir('/unidades', { method: 'POST', body: { nome: 'Norte' } })
    expect(criar.status).toBe(403)
    expect(await criar.json()).toMatchObject({ codigo: 'SO_GESTOR' })
  })
})

describe('a agenda pela API', () => {
  it('horários livres, agendar, remarcar e confirmar, sempre no mesmo formato', async () => {
    const { c, pedir } = await clinicaComChave()
    const livres = await pedir(`/horarios-livres?unidadeId=${c.centro}&procedimentoId=${c.avaliacao}&data=2026-10-08&profissionalId=${c.ana}`)
    expect(livres.status).toBe(200)
    const { profissionais } = (await livres.json()) as { profissionais: { horarios: { inicio: string }[] }[] }
    expect(profissionais[0]!.horarios[0]!.inicio).toBe('2026-10-08T11:00:00.000Z')

    const agendada = await pedir('/consultas', {
      method: 'POST',
      body: {
        unidadeId: c.centro,
        profissionalId: c.ana,
        procedimentoId: c.avaliacao,
        inicio: '2026-10-08T10:00:00-03:00',
        paciente: { nome: 'Maria Souza', telefone: '(62) 99999-0000' },
      },
    })
    expect(agendada.status).toBe(201)
    const consulta = (await agendada.json()) as { id: string; versao: number; paciente: { telefone: string }; cadeira: { nome: string } }
    expect(consulta).toMatchObject({ status: 'agendada', paciente: { nome: 'Maria Souza', telefone: '+5562999990000' }, cadeira: { nome: 'Consultório 1' } })

    const remarcada = await pedir(`/consultas/${consulta.id}/remarcar`, { method: 'POST', body: { inicio: '2026-10-08T15:00:00-03:00', versao: consulta.versao } })
    expect(remarcada.status).toBe(200)
    expect(await remarcada.json()).toMatchObject({ inicio: '2026-10-08T18:00:00.000Z', versao: 2 })

    const atrasada = await pedir(`/consultas/${consulta.id}/status`, { method: 'POST', body: { status: 'confirmada', versao: 1 } })
    expect(atrasada.status).toBe(409)
    expect(await atrasada.json()).toMatchObject({ codigo: 'CONSULTA_ALTERADA' })

    const confirmada = await pedir(`/consultas/${consulta.id}/status`, { method: 'POST', body: { status: 'confirmada', versao: 2 } })
    expect(await confirmada.json()).toMatchObject({ status: 'confirmada' })

    const doDia = (await (await pedir('/consultas?de=2026-10-08T00:00:00-03:00&ate=2026-10-09T00:00:00-03:00')).json()) as { consultas: unknown[] }
    expect(doDia.consultas).toHaveLength(1)
  })

  it('a requisição fora do esquema é 400 com os detalhes', async () => {
    const { pedir } = await clinicaComChave()
    const resposta = await pedir('/consultas', { method: 'POST', body: { unidadeId: 'x' } })
    expect(resposta.status).toBe(400)
    const corpo = (await resposta.json()) as { codigo: string; detalhes: { campo: string }[] }
    expect(corpo.codigo).toBe('REQUISICAO_INVALIDA')
    expect(corpo.detalhes.map((d) => d.campo)).toContain('unidadeId')
  })

  it('a chave só de leitura não agenda', async () => {
    const { c, pedir } = await clinicaComChave(false)
    const resposta = await pedir('/agente/agendar', {
      method: 'POST',
      body: { telefone: '62999990000', nome: 'Maria', unidadeId: c.centro, profissionalId: c.ana, procedimentoId: c.avaliacao, inicio: '2026-10-08T10:00:00-03:00' },
    })
    expect(resposta.status).toBe(403)
    expect(await resposta.json()).toMatchObject({ codigo: 'CHAVE_SO_LEITURA' })
  })
})

describe('o agente pela API', () => {
  it('recomenda, agenda, consulta, remarca, confirma e cancela pelo telefone', async () => {
    const { c, pedir } = await clinicaComChave()
    const recomendacao = (await (
      await pedir(`/agente/disponibilidade?unidadeId=${c.centro}&procedimentoId=${c.aparelho}&data=2026-10-08&telefone=62999990000`)
    ).json()) as { paciente: unknown; recomendado: { profissional: { id: string } }; alternativas: unknown[] }
    expect(recomendacao.paciente).toBeNull()
    expect(recomendacao.recomendado.profissional.id).toBe(c.ana)

    const agendou = await pedir('/agente/agendar', {
      method: 'POST',
      body: { telefone: '5562999990000', nome: 'Maria Souza', unidadeId: c.centro, profissionalId: c.ana, procedimentoId: c.aparelho, inicio: '2026-10-08T10:00:00-03:00' },
    })
    expect(agendou.status).toBe(201)

    const proxima = (await (await pedir('/agente/consulta?telefone=62999990000')).json()) as { consulta: { id: string } }
    expect(proxima.consulta).toMatchObject({ procedimento: { nome: 'Aparelho' } })

    const remarcou = await pedir('/agente/remarcar', { method: 'POST', body: { telefone: '62999990000', inicio: '2026-10-08T11:00:00-03:00' } })
    expect(await remarcou.json()).toMatchObject({ id: proxima.consulta.id, inicio: '2026-10-08T14:00:00.000Z' })

    const confirmou = await pedir('/agente/confirmar', { method: 'POST', body: { telefone: '62999990000' } })
    expect(await confirmou.json()).toMatchObject({ status: 'confirmada' })

    const cancelou = await pedir('/agente/cancelar', { method: 'POST', body: { telefone: '62999990000', motivo: 'Viagem' } })
    expect(await cancelou.json()).toMatchObject({ status: 'cancelada' })

    const semConsulta = (await (await pedir('/agente/consulta?telefone=62999990000')).json()) as { consulta: unknown }
    expect(semConsulta.consulta).toBeNull()
  })

  it('fora do expediente a chave não marca', async () => {
    const { c, pedir } = await clinicaComChave()
    const resposta = await pedir('/agente/agendar', {
      method: 'POST',
      body: { telefone: '62999990000', nome: 'Maria', unidadeId: c.centro, profissionalId: c.ana, procedimentoId: c.avaliacao, inicio: '2026-10-08T12:30:00-03:00' },
    })
    expect(resposta.status).toBe(409)
    expect(await resposta.json()).toMatchObject({ codigo: 'FORA_DO_EXPEDIENTE' })
  })
})

describe('o contrato', () => {
  it('documenta todas as rotas, com o Comece aqui', async () => {
    const contrato = (await (await api.request('/api/openapi.json')).json()) as { info: { description: string }; paths: Record<string, unknown> }
    expect(contrato.info.description).toContain('Comece aqui')
    for (const caminho of [
      '/api/v1/horarios-livres',
      '/api/v1/consultas/{id}/remarcar',
      '/api/v1/pacientes/{id}',
      '/api/v1/agente/agendar',
      '/api/v1/profissionais/{id}/expedientes',
      '/api/v1/bloqueios',
      '/api/v1/chaves',
    ]) {
      expect(Object.keys(contrato.paths)).toContain(caminho)
    }
  })
})
