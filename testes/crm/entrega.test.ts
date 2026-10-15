import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { montarCasosDeUso } from '@/composicao'
import type { Banco } from '@/infra/banco/conexao'
import { ErroDoCrm } from '@/modulos/crm/dominio/entrega'
import { montarClinicaDaAgenda, type ClinicaDaAgenda } from '../apoio/agenda'
import { crmDeMentira } from '../apoio/crm'
import { bancoDeTeste, relogioDeTeste } from '../apoio/banco'

// A entrega dos avisos ao CRM (fase 7) de ponta a ponta: os casos de uso da
// agenda gravam a caixa de saída no PGlite, e o worker entrega a um CRM de
// mentira, que se comporta como a API v1 (um card aberto por telefone, as
// recusas com o código). Agora é quarta, 07/10/2026, 9h em São Paulo.

let pg: PGlite
let banco: Banco
const relogio = relogioDeTeste(new Date('2026-10-07T12:00:00Z'))
const crm = crmDeMentira()
let casos: ReturnType<typeof montarCasosDeUso>

beforeAll(async () => {
  ;({ pg, banco } = await bancoDeTeste())
  casos = montarCasosDeUso({ banco, relogio, apiDoCrm: crm.api })
}, 60_000)
afterAll(() => pg.close())

beforeEach(async () => {
  // Cada teste começa com a caixa vazia, o CRM limpo e o relógio na quarta, 9h.
  await pg.query(`update agenda.caixa_de_saida set situacao = 'concluido' where situacao = 'pendente'`)
  crm.limpar()
  relogio.definir(new Date('2026-10-07T12:00:00Z'))
})

const as = (hora: string, dia = '2026-10-08') => new Date(`${dia}T${hora}:00-03:00`)
const MARIA = { nome: 'Maria Souza', telefone: '(62) 99999-0000' }

const agendar = async (c: ClinicaDaAgenda, extra: Partial<Parameters<ReturnType<typeof montarCasosDeUso>['agenda']['agendar']>[1]> = {}) =>
  (
    await casos.agenda.agendar(c.recepcao, {
      unidadeId: c.centro,
      profissionalId: c.ana,
      procedimentoId: c.avaliacao,
      inicio: as('10:00'),
      paciente: MARIA,
      ...extra,
    })
  ).consulta

/** Entrega tudo o que está vencido, como o worker faria em alguns ciclos. */
async function entregarTudo() {
  let total = 0
  for (;;) {
    const r = await casos.crm.entregarPendentes()
    if (!r.total) return total
    total += r.total
  }
}

async function avisoAoCrm(consultaId: string) {
  const { rows } = await pg.query<{ tipo: string; situacao: string; tentativas: number; resultado: Record<string, unknown> | null; ultimo_erro: string | null; proxima_tentativa_em: Date }>(
    `select tipo, situacao, tentativas, resultado, ultimo_erro, proxima_tentativa_em from agenda.caixa_de_saida where consulta_id = $1 and destino = 'crm' order by id`,
    [consultaId]
  )
  return rows
}

async function cardDaConsulta(consultaId: string) {
  const { rows } = await pg.query<{ crm_card_id: string | null; versao: number }>(`select crm_card_id, versao from agenda.consultas where id = $1`, [consultaId])
  return rows[0]!
}

describe('a consulta nova', () => {
  it('cria o card em Agendados com a data, e a consulta guarda o card sem mudar de versão', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    expect(await entregarTudo()).toBe(1)

    expect(crm.chamadas).toEqual(['criar agendados', `mover agendados ${as('10:00').toISOString()}`])
    const [card] = [...crm.cards.values()]
    expect(card).toMatchObject({ telefone: '+5562999990000', etapa: 'agendados', agendadoPara: as('10:00') })
    expect(await cardDaConsulta(consulta.id)).toEqual({ crm_card_id: card!.id, versao: consulta.versao })
    expect(await avisoAoCrm(consulta.id)).toMatchObject([{ tipo: 'consulta_criada', situacao: 'concluido', tentativas: 1, resultado: { cardId: card!.id } }])
  })

  it('o card aberto em outra coluna vem para Agendados com a hora real do agendamento', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    const card = await crm.api.criarCard('x', { telefone: '+5562999990000', nome: 'Maria', unidadeId: null, etapa: 'em_atendimento' })
    crm.chamadas.length = 0
    relogio.avancar(60 * 60_000) // o CRM ficou fora uma hora
    await entregarTudo()
    expect(crm.chamadas).toEqual(['criar agendados', `mover agendados ${as('10:00').toISOString()} (com agendadoEm)`])
    expect((await cardDaConsulta(consulta.id)).crm_card_id).toBe(card.id)
  })

  it('o card que já está no CRC2 não volta: a entrega termina sem mexer nele', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const card = await crm.api.criarCard('x', { telefone: '+5562999990000', nome: 'Maria', unidadeId: null, etapa: 'agendados' })
    crm.cards.get(card.id)!.painel = 'crc2'
    const consulta = await agendar(c)
    await entregarTudo()
    expect(await avisoAoCrm(consulta.id)).toMatchObject([{ situacao: 'concluido', resultado: { cardId: card.id, ignorado: 'MOVER_ENTRE_PAINEIS' } }])
  })

  it('a clínica desligada do CRM não manda nada', async () => {
    const c = await montarClinicaDaAgenda(pg, { ligadaAoCrm: false })
    const consulta = await agendar(c)
    expect(await entregarTudo()).toBe(0)
    expect(await avisoAoCrm(consulta.id)).toEqual([])
  })
})

describe('depois de marcada', () => {
  it('remarcar muda a data do mesmo card', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    await entregarTudo()
    crm.chamadas.length = 0
    await casos.agenda.remarcar(c.recepcao, consulta.id, { inicio: as('15:00') })
    await entregarTudo()
    expect(crm.chamadas).toEqual([`mover agendados ${as('15:00').toISOString()}`])
  })

  it('remarcar com o card fechado no CRM acha ou cria outro', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    await entregarTudo()
    const antigo = (await cardDaConsulta(consulta.id)).crm_card_id!
    crm.cards.get(antigo)!.aberto = false // foi para Perda no CRM
    crm.chamadas.length = 0
    await casos.agenda.remarcar(c.recepcao, consulta.id, { inicio: as('15:00') })
    await entregarTudo()
    expect(crm.chamadas).toEqual([`mover agendados ${as('15:00').toISOString()}`, 'criar agendados', `mover agendados ${as('15:00').toISOString()}`])
    expect((await cardDaConsulta(consulta.id)).crm_card_id).not.toBe(antigo)
  })

  it('cancelar a única consulta leva o card a Cancelados; a falta, a Faltosos', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const cancelada = await agendar(c)
    const faltou = await agendar(c, { inicio: as('10:00', '2026-10-09'), paciente: { nome: 'João Lima', telefone: '(62) 98888-0000' } })
    await entregarTudo()
    crm.chamadas.length = 0
    await casos.agenda.mudarStatus(c.recepcao, cancelada.id, { status: 'cancelada' })
    relogio.definir(as('11:00', '2026-10-09'))
    await casos.agenda.mudarStatus(c.recepcao, faltou.id, { status: 'faltou' })
    await entregarTudo()
    expect(crm.chamadas.sort()).toEqual(['mover cancelados', 'mover faltosos'])
  })

  it('a família no mesmo telefone: cancelar uma deixa o card na consulta que sobrou', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const daMae = await agendar(c)
    await agendar(c, { inicio: as('11:00'), paciente: { nome: 'Pedro Souza', telefone: MARIA.telefone } })
    await entregarTudo()
    const [card] = [...crm.cards.values()]
    expect(crm.cards.size).toBe(1)
    expect(card!.agendadoPara).toEqual(as('10:00')) // a próxima das duas

    crm.chamadas.length = 0
    await casos.agenda.mudarStatus(c.recepcao, daMae.id, { status: 'cancelada' })
    await entregarTudo()
    expect(crm.chamadas).toEqual([`mover agendados ${as('11:00').toISOString()}`])
    expect(card).toMatchObject({ etapa: 'agendados', agendadoPara: as('11:00') })
  })

  it('a chegada passa o card ao CRC2; repetir não dá erro', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    await entregarTudo()
    const cardId = (await cardDaConsulta(consulta.id)).crm_card_id!
    crm.cards.get(cardId)!.painel = 'crc2' // alguém já marcou no CRM
    relogio.definir(as('09:55'))
    await casos.agenda.mudarStatus(c.recepcao, consulta.id, { status: 'em_atendimento' })
    await entregarTudo()
    expect((await avisoAoCrm(consulta.id)).at(-1)).toMatchObject({ tipo: 'paciente_compareceu', situacao: 'concluido', resultado: { cardId, ignorado: 'JA_ESTA_EM_OUTRO_PAINEL' } })
  })

  it('cancelar sem card no CRM termina sem fazer nada', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    await pg.query(`update agenda.caixa_de_saida set situacao = 'concluido' where consulta_id = $1`, [consulta.id]) // nunca chegou ao CRM
    await casos.agenda.mudarStatus(c.recepcao, consulta.id, { status: 'cancelada' })
    await entregarTudo()
    expect(crm.chamadas).toEqual(['do-contato'])
    expect((await avisoAoCrm(consulta.id)).at(-1)).toMatchObject({ situacao: 'concluido', resultado: { cardId: null, ignorado: 'SEM_CARD_ABERTO' } })
  })
})

describe('a ordem e as falhas', () => {
  it('os avisos da mesma consulta saem um de cada vez, na ordem', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    await casos.agenda.mudarStatus(c.recepcao, consulta.id, { status: 'cancelada' })
    expect((await casos.crm.entregarPendentes()).total).toBe(1)
    expect((await casos.crm.entregarPendentes()).total).toBe(1)
    expect(crm.chamadas).toEqual(['criar agendados', `mover agendados ${as('10:00').toISOString()}`, 'mover cancelados'])
  })

  it('com o CRM fora do ar, tenta de novo depois e entrega quando ele volta', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    crm.falhar(new ErroDoCrm(0, null, 'O CRM não respondeu: fetch failed'))
    expect(await casos.crm.entregarPendentes()).toMatchObject({ total: 1, adiados: 1 })
    expect(await avisoAoCrm(consulta.id)).toMatchObject([
      { situacao: 'pendente', tentativas: 1, ultimo_erro: 'O CRM não respondeu: fetch failed', proxima_tentativa_em: new Date('2026-10-07T12:00:30Z') },
    ])
    expect((await casos.crm.entregarPendentes()).total).toBe(0) // ainda não venceu

    crm.falhar(null)
    relogio.avancar(30_000)
    expect(await casos.crm.entregarPendentes()).toMatchObject({ total: 1, entregues: 1 })
    expect(await avisoAoCrm(consulta.id)).toMatchObject([{ situacao: 'concluido', tentativas: 2 }])
  })

  it('desiste depois da última tentativa', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    crm.falhar(new ErroDoCrm(503, null, 'CRM 503: fora do ar'))
    for (let i = 0; i < 9; i++) {
      await casos.crm.entregarPendentes()
      relogio.avancar(13 * 60 * 60_000)
    }
    expect(await avisoAoCrm(consulta.id)).toMatchObject([{ situacao: 'falhou', tentativas: 9, ultimo_erro: 'CRM 503: fora do ar' }])
  })

  it('o pedido recusado por uma regra desiste na hora', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    crm.falhar(new ErroDoCrm(400, 'DADOS_INVALIDOS', 'CRM 400 DADOS_INVALIDOS: telefone inválido'))
    await casos.crm.entregarPendentes()
    expect(await avisoAoCrm(consulta.id)).toMatchObject([{ situacao: 'falhou', tentativas: 1 }])
  })

  it('sem a chave do CRM, nada sai e os avisos esperam', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    const semCrm = montarCasosDeUso({ banco, relogio })
    expect(await semCrm.crm.entregarPendentes()).toMatchObject({ total: 0 })
    expect(await avisoAoCrm(consulta.id)).toMatchObject([{ situacao: 'pendente', tentativas: 0 }])
  })
})
