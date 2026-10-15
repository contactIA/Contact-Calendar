import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarApi } from '@/api/app'
import { montarCasosDeUso } from '@/composicao'
import { DURACAO_DA_SESSAO_S } from '@/modulos/acesso/aplicacao/casos'
import { montarClinicaDaAgenda } from '../apoio/agenda'
import { bancoDeTeste, relogioDeTeste } from '../apoio/banco'

// O login da tela pelo item de menu, de ponta a ponta: a entrada com os
// cabeçalhos da navegação, o token assinado e a API com X-Agenda-Sessao.

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres'
const PLATAFORMA = 'app.fluxodonto.com'

let pg: PGlite
let casos: ReturnType<typeof montarCasosDeUso>
let api: ReturnType<typeof criarApi>
const relogio = relogioDeTeste(new Date('2026-10-07T12:00:00Z'))

beforeAll(async () => {
  const teste = await bancoDeTeste()
  pg = teste.pg
  casos = montarCasosDeUso({
    banco: teste.banco,
    relogio,
    sessao: { segredoDaSessao: SEGREDO, hostsDaPlataforma: [PLATAFORMA], exigirHostsDaPlataforma: true },
  })
  api = criarApi(() => casos)
}, 60_000)
afterAll(() => pg.close())

let ip = 0
/** Cada entrada de um IP novo, para o limite de tentativas não atrapalhar os outros testes. */
const daPlataforma = (companyId: string, userId: string) => ({
  companyId,
  userId,
  referer: `https://${PLATAFORMA}/chat`,
  destino: 'iframe',
  ip: `10.0.0.${++ip}`,
})

async function clinicaComUsuarios() {
  const c = await montarClinicaDaAgenda(pg)
  const companyId = (await pg.query<{ company_id: string }>('select company_id from agenda.clinicas where id = $1', [c.clinica])).rows[0]!.company_id
  const usuario = async (nome: string, papel: 'gestor' | 'recepcao' | 'dentista') => {
    const plataforma = crypto.randomUUID()
    const id = (
      await pg.query<{ id: string }>(`insert into agenda.usuarios (clinica_id, usuario_plataforma_id, nome, ${papel}) values ($1, $2, $3, true) returning id`, [
        c.clinica,
        plataforma,
        nome,
      ])
    ).rows[0]!.id
    return { id, plataforma }
  }
  return { c, companyId, gestora: await usuario('Gestora', 'gestor'), recepcao: await usuario('Rita', 'recepcao') }
}

async function entrar(companyId: string, userId: string) {
  const entrada = await casos.acesso.entrarPeloMenu(daPlataforma(companyId, userId))
  if (entrada.tipo !== 'ok') throw new Error(`entrada recusada: ${entrada.motivo}`)
  return entrada.token
}

const comSessao = (token: string, caminho: string, headers: Record<string, string> = {}) =>
  api.request(`/api/v1${caminho}`, { headers: { 'X-Agenda-Sessao': token, ...headers } })

describe('entrada pelo item de menu', () => {
  it('quem a clínica vinculou entra e recebe o token', async () => {
    const { companyId, gestora } = await clinicaComUsuarios()
    const entrada = await casos.acesso.entrarPeloMenu(daPlataforma(companyId, gestora.plataforma))
    expect(entrada).toMatchObject({ tipo: 'ok', usuario: { nome: 'Gestora', papeis: { gestor: true } } })
  })

  it('recusa a clínica que a agenda não conhece e o usuário sem vínculo', async () => {
    const { companyId } = await clinicaComUsuarios()
    expect(await casos.acesso.entrarPeloMenu(daPlataforma(crypto.randomUUID(), crypto.randomUUID()))).toEqual({
      tipo: 'recusada',
      motivo: 'clinica_nao_cadastrada',
    })
    expect(await casos.acesso.entrarPeloMenu(daPlataforma(companyId, crypto.randomUUID()))).toEqual({ tipo: 'recusada', motivo: 'usuario_sem_papel' })
  })

  it('o id interno da clínica não serve no lugar do companyId', async () => {
    const { c, gestora } = await clinicaComUsuarios()
    expect(await casos.acesso.entrarPeloMenu(daPlataforma(c.clinica, gestora.plataforma))).toEqual({ tipo: 'recusada', motivo: 'clinica_nao_cadastrada' })
  })

  it('recusa o usuário desativado e quem vem de fora da plataforma', async () => {
    const { companyId, gestora, recepcao } = await clinicaComUsuarios()
    await pg.query('update agenda.usuarios set ativo = false where id = $1', [recepcao.id])
    expect(await casos.acesso.entrarPeloMenu(daPlataforma(companyId, recepcao.plataforma))).toEqual({ tipo: 'recusada', motivo: 'usuario_sem_papel' })
    const deFora = { ...daPlataforma(companyId, gestora.plataforma), referer: 'https://golpe.io/', destino: 'document' }
    expect(await casos.acesso.entrarPeloMenu(deFora)).toEqual({ tipo: 'recusada', motivo: 'fora_da_plataforma' })
  })

  it('muitas tentativas do mesmo IP param por um minuto', async () => {
    const { companyId, gestora } = await clinicaComUsuarios()
    const pedido = { ...daPlataforma(companyId, gestora.plataforma), ip: '10.9.9.9' }
    for (let i = 0; i < 30; i++) expect((await casos.acesso.entrarPeloMenu(pedido)).tipo).toBe('ok')
    expect(await casos.acesso.entrarPeloMenu(pedido)).toEqual({ tipo: 'recusada', motivo: 'muitas_tentativas' })
  })

  it('em produção, sem a lista de hosts ninguém entra', async () => {
    const { banco } = await bancoDeTeste()
    const semHosts = montarCasosDeUso({ banco, relogio, sessao: { segredoDaSessao: SEGREDO, hostsDaPlataforma: [], exigirHostsDaPlataforma: true } })
    await expect(semHosts.acesso.entrarPeloMenu(daPlataforma(crypto.randomUUID(), crypto.randomUUID()))).rejects.toMatchObject({
      codigo: 'SEM_HOSTS_DA_PLATAFORMA',
    })
  })
})

describe('a sessão na API', () => {
  it('o /eu traz o usuário, os papéis e a clínica com o fuso e a cadência', async () => {
    const { c, companyId, gestora } = await clinicaComUsuarios()
    const resposta = await comSessao(await entrar(companyId, gestora.plataforma), '/eu')
    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({
      usuario: { id: gestora.id, nome: 'Gestora', papeis: { gestor: true, recepcao: false, dentista: false }, profissionalId: null, unidades: [] },
      clinica: { id: c.clinica, companyId, nome: 'Clínica Sorriso', fusoHorario: 'America/Sao_Paulo', cadenciaMinutos: 30, procedimentoDasVindasId: null },
    })
  })

  it('o dentista vem com o profissional dele', async () => {
    const { c, companyId } = await clinicaComUsuarios()
    const ana = (await pg.query<{ usuario_plataforma_id: string }>("select usuario_plataforma_id from agenda.usuarios where clinica_id = $1 and nome = 'Dra. Ana'", [c.clinica]))
      .rows[0]!.usuario_plataforma_id
    const eu = (await (await comSessao(await entrar(companyId, ana), '/eu')).json()) as { usuario: { profissionalId: string } }
    expect(eu.usuario.profissionalId).toBe(c.ana)
  })

  it('a sessão vale nas rotas da agenda, com os papéis da pessoa', async () => {
    const { companyId, gestora, recepcao } = await clinicaComUsuarios()
    const unidades = await comSessao(await entrar(companyId, recepcao.plataforma), '/unidades')
    expect(unidades.status).toBe(200)
    // A recepção lê os cadastros, mas só o gestor vê as chaves.
    expect((await comSessao(await entrar(companyId, recepcao.plataforma), '/chaves')).status).toBe(403)
    expect((await comSessao(await entrar(companyId, gestora.plataforma), '/chaves')).status).toBe(200)
  })

  it('token adulterado, vencido ou de usuário desativado é 401', async () => {
    const { companyId, gestora, recepcao } = await clinicaComUsuarios()
    const token = await entrar(companyId, gestora.plataforma)
    const [conteudo, assinatura] = token.split('.')
    const outro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(conteudo!, 'base64url').toString()), u: recepcao.id })).toString('base64url')
    expect((await comSessao(`${outro}.${assinatura}`, '/eu')).status).toBe(401)

    const daRecepcao = await entrar(companyId, recepcao.plataforma)
    await pg.query('update agenda.usuarios set ativo = false where id = $1', [recepcao.id])
    expect((await comSessao(daRecepcao, '/eu')).status).toBe(401)

    relogio.avancar(DURACAO_DA_SESSAO_S * 1000)
    try {
      const vencido = await comSessao(token, '/eu')
      expect(vencido.status).toBe(401)
      expect(await vencido.json()).toMatchObject({ codigo: 'NAO_AUTENTICADO' })
    } finally {
      relogio.avancar(-DURACAO_DA_SESSAO_S * 1000)
    }
  })

  it('o X-Clinica de outra clínica é 403, e a chave não tem /eu', async () => {
    const { companyId, gestora } = await clinicaComUsuarios()
    const token = await entrar(companyId, gestora.plataforma)
    const outra = await montarClinicaDaAgenda(pg)
    const divergente = await comSessao(token, '/eu', { 'X-Clinica': outra.clinica })
    expect(divergente.status).toBe(403)
    expect(await divergente.json()).toMatchObject({ codigo: 'CLINICA_DIVERGENTE' })

    const gestor = {
      tipo: 'usuario' as const,
      clinicaId: outra.clinica,
      usuarioId: crypto.randomUUID(),
      nome: 'Gestora',
      papeis: { gestor: true, recepcao: false, dentista: false },
      profissionalId: null,
    }
    const { chave } = await casos.acesso.criarChave(gestor, { nome: 'Agente', tipo: 'ia', podeEscrever: false })
    const pelaChave = await api.request('/api/v1/eu', { headers: { Authorization: `Bearer ${chave}` } })
    expect(pelaChave.status).toBe(403)
    expect(await pelaChave.json()).toMatchObject({ codigo: 'SO_PELA_TELA' })
  })

  it('sem o segredo no servidor, nenhuma sessão é aceita', async () => {
    const { banco } = await bancoDeTeste()
    const semSegredo = criarApi(() => montarCasosDeUso({ banco, relogio }))
    const resposta = await semSegredo.request('/api/v1/eu', { headers: { 'X-Agenda-Sessao': 'qualquer.coisa' } })
    expect(resposta.status).toBe(401)
  })

  it('a cadência da grade: só o gestor muda, e só para os valores da lista', async () => {
    const { companyId, gestora, recepcao } = await clinicaComUsuarios()
    const mudar = async (token: string, cadenciaMinutos: number) =>
      api.request('/api/v1/clinica', {
        method: 'PATCH',
        headers: { 'X-Agenda-Sessao': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadenciaMinutos }),
      })
    const daGestora = await entrar(companyId, gestora.plataforma)
    const mudou = await mudar(daGestora, 15)
    expect(mudou.status).toBe(200)
    expect(await mudou.json()).toMatchObject({ clinica: { cadenciaMinutos: 15 } })
    const invalida = await mudar(daGestora, 45)
    expect(invalida.status).toBe(400)
    expect(await invalida.json()).toMatchObject({ codigo: 'CADENCIA_INVALIDA' })
    expect((await mudar(await entrar(companyId, recepcao.plataforma), 30)).status).toBe(403)
  })
})
