import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { montarCasosDeUso } from '@/composicao'
import type { Banco } from '@/infra/banco/conexao'
import type { Acesso } from '@/modulos/acesso/aplicacao/acesso'
import { ErroDoCrm } from '@/modulos/crm/dominio/entrega'
import { montarClinicaDaAgenda, type ClinicaDaAgenda } from '../apoio/agenda'
import { bancoDeTeste, relogioDeTeste } from '../apoio/banco'
import { crmDeMentira } from '../apoio/crm'

// A conversa com o paciente a partir da consulta (fase 7c): quem acha a conversa
// é o CRM, pelo card da consulta ou pelo card aberto do telefone.

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
beforeEach(() => crm.limpar())

const as = (hora: string) => new Date(`2026-10-08T${hora}:00-03:00`)

const agendar = async (c: ClinicaDaAgenda, profissionalId = c.ana) =>
  (await casos.agenda.agendar(c.recepcao, { unidadeId: c.centro, profissionalId, procedimentoId: c.avaliacao, inicio: as('10:00'), paciente: { nome: 'Maria Souza', telefone: '(62) 99999-0000' } })).consulta

describe('a conversa do paciente', () => {
  it('pelo card que a consulta guardou', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    const card = crm.novoCard({ telefone: '+5562999990000' })
    await pg.query(`update agenda.consultas set crm_card_id = $2 where id = $1`, [consulta.id, card.id])
    expect(await casos.crm.conversaDaConsulta(c.recepcao, consulta.id)).toEqual({ url: `https://plataforma.teste/conversa/${card.id}` })
    expect(crm.chamadas).toEqual(['atendimento'])
  })

  it('sem card guardado, pelo card aberto do telefone', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    const card = crm.novoCard({ telefone: '+5562999990000' })
    expect(await casos.crm.conversaDaConsulta(c.recepcao, consulta.id)).toEqual({ url: `https://plataforma.teste/conversa/${card.id}` })
    expect(crm.chamadas).toEqual(['do-contato', 'atendimento'])
  })

  it('sem card nem conversa, a frase de que não há conversa', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    await expect(casos.crm.conversaDaConsulta(c.recepcao, consulta.id)).rejects.toMatchObject({ codigo: 'SEM_CONVERSA' })
  })

  it('o CRM fora do ar vira uma frase, não um erro solto', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    crm.falhar(new ErroDoCrm(0, null, 'O CRM não respondeu: fetch failed'))
    await expect(casos.crm.conversaDaConsulta(c.recepcao, consulta.id)).rejects.toMatchObject({ tipo: 'externo', codigo: 'CRM_FALHOU' })
  })

  it('o dentista não abre a conversa da consulta de outro dentista', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const doBruno = await agendar(c, c.bruno)
    crm.novoCard({ telefone: '+5562999990000' })
    await expect(casos.crm.conversaDaConsulta(c.dentistaAna as Acesso, doBruno.id)).rejects.toMatchObject({ codigo: 'CONSULTA_NAO_ENCONTRADA' })
  })

  it('sem o CRM configurado, avisa', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const consulta = await agendar(c)
    const semCrm = montarCasosDeUso({ banco, relogio })
    await expect(semCrm.crm.conversaDaConsulta(c.recepcao, consulta.id)).rejects.toMatchObject({ codigo: 'CRM_NAO_CONFIGURADO' })
  })
})
