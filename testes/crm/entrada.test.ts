import { createHmac, randomBytes } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { montarCasosDeUso } from '@/composicao'
import type { Banco } from '@/infra/banco/conexao'
import { cifrar, decifrar } from '@/infra/cripto/cripto'
import type { Acesso } from '@/modulos/acesso/aplicacao/acesso'
import { montarClinicaDaAgenda, type ClinicaDaAgenda } from '../apoio/agenda'
import { bancoDeTeste, relogioDeTeste } from '../apoio/banco'
import { CHAVE_DA_AGENDA, crmDeMentira, type CardFalso } from '../apoio/crm'

// A entrada do CRM na agenda (fase 7b) de ponta a ponta: a clínica é ligada (o
// webhook nasce no CRM de mentira), o aviso chega assinado, o worker lê o card
// como ele está e a agenda encaixa, remarca, cancela ou deixa na lista "Vindas do
// CRM". Agora é quarta, 07/10/2026, 9h em São Paulo; as consultas são na quinta.

let pg: PGlite
let banco: Banco
const relogio = relogioDeTeste(new Date('2026-10-07T12:00:00Z'))
const crm = crmDeMentira()
const CHAVE = randomBytes(32)
let casos: ReturnType<typeof montarCasosDeUso>

beforeAll(async () => {
  ;({ pg, banco } = await bancoDeTeste())
  casos = montarCasosDeUso({
    banco,
    relogio,
    apiDoCrm: crm.api,
    urlDaAgenda: 'https://agenda.teste',
    cifra: { cifrar: (t) => cifrar(t, CHAVE), decifrar: (g) => decifrar(g, CHAVE) },
  })
}, 60_000)
afterAll(() => pg.close())

beforeEach(async () => {
  await pg.query(`update agenda.entradas_do_crm set situacao = 'processado' where situacao = 'pendente'`)
  crm.limpar()
  relogio.definir(new Date('2026-10-07T12:00:00Z'))
})

const as = (hora: string, dia = '2026-10-08') => new Date(`${dia}T${hora}:00-03:00`)

interface Cenario extends ClinicaDaAgenda {
  companyId: string
  crmCentro: string
  gestor: Acesso
}

/** A clínica da agenda ligada ao CRM, com a Dra. Ana ligada ao dentista "clinicorp-ana" e a Avaliação como procedimento das vindas. */
async function clinicaLigada(opcoes: { semVinculos?: boolean } = {}): Promise<Cenario> {
  const c = await montarClinicaDaAgenda(pg, { ligadaAoCrm: false })
  const { rows } = await pg.query<{ company_id: string; crm_unidade_id: string }>(
    `select k.company_id, u.crm_unidade_id from agenda.clinicas k join agenda.unidades u on u.clinica_id = k.id where k.id = $1 and u.id = $2`,
    [c.clinica, c.centro]
  )
  const gestor: Acesso = {
    tipo: 'usuario',
    clinicaId: c.clinica,
    usuarioId: crypto.randomUUID(),
    nome: 'Gestora',
    papeis: { gestor: true, recepcao: false, dentista: false },
    profissionalId: null,
  }
  if (!opcoes.semVinculos) {
    await pg.query(`update agenda.profissionais set id_no_prontuario = 'clinicorp-ana' where id = $1`, [c.ana])
    await pg.query(`update agenda.clinicas set procedimento_das_vindas_id = $2 where id = $1`, [c.clinica, c.avaliacao])
  }
  await casos.crm.ligar(gestor)
  return { ...c, companyId: rows[0]!.company_id, crmCentro: rows[0]!.crm_unidade_id, gestor }
}

let entrega = 1000

/** O CRM manda um aviso assinado com o segredo do webhook ("whsec_teste" no CRM de mentira). */
async function avisar(c: Cenario, card: CardFalso, extra: { tipo?: string; evento?: string; para?: string | null; ator?: { tipo: string; id: string | null }; dados?: Record<string, unknown> } = {}) {
  const corpo = JSON.stringify({
    id: ++entrega,
    evento: extra.evento ?? 'card.movido',
    tipo: extra.tipo ?? 'movido',
    eventoId: entrega,
    ocorridoEm: relogio.agora().toISOString(),
    clinica: { id: crypto.randomUUID(), companyId: c.companyId },
    card: { id: card.id },
    de: null,
    para: extra.para === null ? null : { chave: extra.para ?? card.etapa, nome: '' },
    ator: extra.ator ?? { tipo: 'usuario', id: crypto.randomUUID(), nome: 'CRC' },
    dados: extra.dados ?? {},
  })
  const t = Math.floor(relogio.agora().getTime() / 1000)
  const v1 = createHmac('sha256', 'whsec_teste').update(`${t}.${corpo}`).digest('hex')
  return casos.crm.receberAviso(corpo, `t=${t},v1=${v1}`)
}

async function processarTudo() {
  for (;;) {
    const r = await casos.crm.processarEntradas()
    if (!r.total) return
  }
}

/** Um card do CRM em Agendados, marcado pela CRC na Clinicorp com o dentista dado. */
function cardMarcadoNaClinicorp(c: Cenario, dentista = { id: 'clinicorp-ana', nome: 'Dra. Ana' }, inicio = as('10:00')) {
  const card = crm.novoCard({ telefone: '+5562977770000', nome: 'Carla Dias', agendadoPara: inicio, unidadeId: c.crmCentro })
  crm.consultas.set(card.id, [{ situacao: 'agendada', inicio, fim: new Date(inicio.getTime() + 30 * 60_000), unidadeId: c.crmCentro, profissional: dentista }])
  return card
}

const consultaDoCard = async (cardId: string) =>
  (
    await pg.query<{ id: string; status: string; inicio: Date; fim: Date; profissional_id: string; criada_por_tipo: string }>(
      `select id, status, inicio, fim, profissional_id, criada_por_tipo from agenda.consultas where crm_card_id = $1 order by criado_em`,
      [cardId]
    )
  ).rows

const avisosAoCrmDa = async (consultaId: string) =>
  (await pg.query<{ tipo: string }>(`select tipo from agenda.caixa_de_saida where consulta_id = $1 and destino = 'crm' order by id`, [consultaId])).rows.map((l) => l.tipo)

const entradas = async (clinicaId: string) =>
  (await pg.query<{ situacao: string; resultado: Record<string, unknown> }>(`select situacao, resultado from agenda.entradas_do_crm where clinica_id = $1 order by id`, [clinicaId])).rows

describe('ligar e receber', () => {
  it('ligar cadastra o webhook da clínica no CRM e guarda o segredo cifrado', async () => {
    const c = await clinicaLigada()
    expect([...crm.webhooks.values()]).toEqual([{ url: 'https://agenda.teste/api/v1/crm/avisos', eventos: ['card.criado', 'card.movido', 'card.alterado'] }])
    const { rows } = await pg.query<{ ligada_ao_crm: boolean; crm_webhook_segredo_cifrado: string }>(`select ligada_ao_crm, crm_webhook_segredo_cifrado from agenda.clinicas where id = $1`, [c.clinica])
    expect(rows[0]!.ligada_ao_crm).toBe(true)
    expect(rows[0]!.crm_webhook_segredo_cifrado).not.toContain('whsec')
    expect(await casos.crm.estadoDaLigacao(c.gestor)).toEqual({ ligada: true, recebeAvisos: true, podeLigar: true })
  })

  it('ligar de novo troca o webhook; desligar apaga', async () => {
    const c = await clinicaLigada()
    await casos.crm.ligar(c.gestor)
    expect(crm.webhooks.size).toBe(1)
    expect(await casos.crm.desligar(c.gestor)).toMatchObject({ ligada: false, recebeAvisos: false })
    expect(crm.webhooks.size).toBe(0)
  })

  it('só o gestor liga', async () => {
    const c = await clinicaLigada()
    await expect(casos.crm.ligar(c.recepcao)).rejects.toMatchObject({ codigo: 'SO_GESTOR' })
  })

  it('o aviso com assinatura errada, vencida ou de clínica não ligada é recusado; o repetido é aceito e ignorado', async () => {
    const c = await clinicaLigada()
    const card = cardMarcadoNaClinicorp(c)
    const corpo = JSON.stringify({ id: 1, evento: 'card.movido', tipo: 'movido', clinica: { id: 'x', companyId: c.companyId }, card: { id: card.id } })
    const t = Math.floor(relogio.agora().getTime() / 1000)
    const assinar = (segredo: string, quando = t) => `t=${quando},v1=${createHmac('sha256', segredo).update(`${quando}.${corpo}`).digest('hex')}`
    await expect(casos.crm.receberAviso(corpo, assinar('outro'))).rejects.toMatchObject({ codigo: 'ASSINATURA_INVALIDA' })
    await expect(casos.crm.receberAviso(corpo, null)).rejects.toMatchObject({ codigo: 'ASSINATURA_INVALIDA' })
    await expect(casos.crm.receberAviso(corpo, assinar('whsec_teste', t - 3600))).rejects.toMatchObject({ codigo: 'ASSINATURA_VENCIDA' })
    await expect(casos.crm.receberAviso(corpo.replace(c.companyId, crypto.randomUUID()), assinar('whsec_teste'))).rejects.toMatchObject({ codigo: 'CLINICA_NAO_LIGADA' })
    expect(await casos.crm.receberAviso(corpo, assinar('whsec_teste'))).toBe('novo')
    expect(await casos.crm.receberAviso(corpo, assinar('whsec_teste'))).toBe('repetido')
  })
})

describe('o card marcado no CRM', () => {
  it('entra sozinho na agenda: o dentista ligado, a duração da Clinicorp, a primeira cadeira livre, sem aviso de volta ao CRM', async () => {
    const c = await clinicaLigada()
    const card = cardMarcadoNaClinicorp(c)
    await avisar(c, card)
    await processarTudo()

    const [consulta] = await consultaDoCard(card.id)
    expect(consulta).toMatchObject({ status: 'agendada', inicio: as('10:00'), fim: as('10:30'), profissional_id: c.ana, criada_por_tipo: 'sistema' })
    expect(await avisosAoCrmDa(consulta!.id)).toEqual([])
    expect(await casos.vindas.listar(c.recepcao)).toEqual([])
    expect(await entradas(c.clinica)).toMatchObject([{ situacao: 'processado', resultado: { acao: 'encaixada', consultaId: consulta!.id } }])
  })

  it('os três avisos de uma marcação (movido, data, consulta) dão uma consulta só', async () => {
    const c = await clinicaLigada()
    const card = cardMarcadoNaClinicorp(c)
    await avisar(c, card)
    await avisar(c, card, { evento: 'card.alterado', tipo: 'campo_alterado', para: null, dados: { campo: 'agendadoPara' } })
    await avisar(c, card, { evento: 'card.alterado', tipo: 'consulta_no_prontuario', para: null })
    await processarTudo()
    expect(await consultaDoCard(card.id)).toHaveLength(1)
    expect((await entradas(c.clinica)).map((e) => e.resultado.acao)).toEqual(['encaixada', 'ja_estava', 'ja_estava'])
  })

  it('o aviso que a própria agenda causou é ignorado, sem ler o card', async () => {
    const c = await clinicaLigada()
    const card = cardMarcadoNaClinicorp(c)
    await avisar(c, card, { ator: { tipo: 'integracao', id: CHAVE_DA_AGENDA } })
    await processarTudo()
    expect(crm.chamadas).not.toContain('card')
    expect(await entradas(c.clinica)).toMatchObject([{ situacao: 'ignorado', resultado: { motivo: 'DA_PROPRIA_AGENDA' } }])
  })

  it('o dentista sem par na agenda deixa a vinda na lista; a recepção encaixa, e o dentista fica ligado para a próxima', async () => {
    const c = await clinicaLigada()
    const card = cardMarcadoNaClinicorp(c, { id: 'clinicorp-bruno', nome: 'Dr. Bruno' })
    await avisar(c, card)
    await processarTudo()
    expect(await consultaDoCard(card.id)).toEqual([])
    const [vinda] = await casos.vindas.listar(c.recepcao)
    expect(vinda).toMatchObject({
      tipo: 'marcar',
      motivo: 'DENTISTA_SEM_VINCULO',
      nome: 'Carla Dias',
      unidade: { id: c.centro, nome: 'Centro' },
      inicio: as('10:00'),
      profissionalNoProntuario: { id: 'clinicorp-bruno', nome: 'Dr. Bruno' },
    })

    const consulta = await casos.vindas.encaixar(c.recepcao, vinda!.id, { profissionalId: c.bruno, procedimentoId: c.avaliacao })
    expect(consulta).toMatchObject({ profissionalId: c.bruno, inicio: as('10:00'), fim: as('10:30') })
    expect(await casos.vindas.listar(c.recepcao)).toEqual([])
    // A recepção agiu como ela mesma: o CRM recebe o aviso normal.
    expect(await avisosAoCrmDa(consulta.id)).toEqual(['consulta_criada'])

    const outro = crm.novoCard({ telefone: '+5562966660000', nome: 'Davi Reis', agendadoPara: as('15:00'), unidadeId: c.crmCentro })
    crm.consultas.set(outro.id, [{ situacao: 'agendada', inicio: as('15:00'), fim: as('16:00'), unidadeId: c.crmCentro, profissional: { id: 'clinicorp-bruno', nome: 'Dr. Bruno' } }])
    await avisar(c, outro)
    await processarTudo()
    expect(await consultaDoCard(outro.id)).toMatchObject([{ profissional_id: c.bruno }])
  })

  it('sem o procedimento das vindas, ou sem dentista (o botão, a IA), a vinda espera a recepção', async () => {
    const c = await clinicaLigada({ semVinculos: true })
    const daClinicorp = cardMarcadoNaClinicorp(c)
    const daIa = crm.novoCard({ telefone: '+5562955550000', nome: 'Eva Melo', agendadoPara: as('14:00'), unidadeId: c.crmCentro })
    await avisar(c, daClinicorp)
    await avisar(c, daIa, { ator: { tipo: 'ia', id: 'chave-da-ia' } })
    await processarTudo()
    expect((await casos.vindas.listar(c.recepcao)).map((v) => v.motivo)).toEqual(['DENTISTA_SEM_VINCULO', 'SEM_DENTISTA'])
  })

  it('a unidade do card sem par na agenda fica na lista sem unidade', async () => {
    const c = await clinicaLigada()
    const card = crm.novoCard({ telefone: '+5562944440000', nome: 'Fábio', agendadoPara: as('10:00'), unidadeId: crypto.randomUUID() })
    await avisar(c, card)
    await processarTudo()
    expect(await casos.vindas.listar(c.recepcao)).toMatchObject([{ motivo: 'UNIDADE_SEM_VINCULO', unidade: null }])
  })

  it('o horário ocupado na agenda deixa a vinda na lista, com o motivo', async () => {
    const c = await clinicaLigada()
    await casos.agenda.agendar(c.recepcao, { unidadeId: c.centro, profissionalId: c.ana, procedimentoId: c.avaliacao, inicio: as('10:00'), paciente: { nome: 'Outro', telefone: '62911112222' } })
    const card = cardMarcadoNaClinicorp(c)
    await avisar(c, card)
    await processarTudo()
    expect(await casos.vindas.listar(c.recepcao)).toMatchObject([{ motivo: 'HORARIO_DO_PROFISSIONAL_OCUPADO' }])
  })

  it('a recepção pode descartar a vinda', async () => {
    const c = await clinicaLigada({ semVinculos: true })
    const card = cardMarcadoNaClinicorp(c)
    await avisar(c, card)
    await processarTudo()
    const [vinda] = await casos.vindas.listar(c.recepcao)
    await casos.vindas.descartar(c.recepcao, vinda!.id)
    expect(await casos.vindas.listar(c.recepcao)).toEqual([])
    await expect(casos.vindas.descartar(c.recepcao, vinda!.id)).rejects.toMatchObject({ codigo: 'VINDA_NAO_ENCONTRADA' })
  })
})

describe('a agenda acompanha o card', () => {
  async function encaixada(c: Cenario) {
    const card = cardMarcadoNaClinicorp(c)
    await avisar(c, card)
    await processarTudo()
    const [consulta] = await consultaDoCard(card.id)
    return { card, consulta: consulta! }
  }

  it('a data mudada no CRM remarca a consulta, sem aviso de volta', async () => {
    const c = await clinicaLigada()
    const { card, consulta } = await encaixada(c)
    card.agendadoPara = as('15:00')
    crm.consultas.set(card.id, [{ situacao: 'agendada', inicio: as('15:00'), fim: as('15:30'), unidadeId: c.crmCentro, profissional: { id: 'clinicorp-ana', nome: 'Dra. Ana' } }])
    await avisar(c, card, { evento: 'card.alterado', tipo: 'campo_alterado', para: null, dados: { campo: 'agendadoPara' } })
    await processarTudo()
    expect(await consultaDoCard(card.id)).toMatchObject([{ id: consulta.id, inicio: as('15:00'), fim: as('15:30') }])
    expect(await avisosAoCrmDa(consulta.id)).toEqual([])
  })

  it('a data nova que não cabe vira uma vinda de remarcação', async () => {
    const c = await clinicaLigada()
    const { card, consulta } = await encaixada(c)
    await casos.agenda.agendar(c.recepcao, { unidadeId: c.centro, profissionalId: c.ana, procedimentoId: c.avaliacao, inicio: as('15:00'), paciente: { nome: 'Outro', telefone: '62911112222' } })
    card.agendadoPara = as('15:00')
    crm.consultas.set(card.id, [])
    await avisar(c, card, { evento: 'card.alterado', tipo: 'campo_alterado', para: null, dados: { campo: 'agendadoPara' } })
    await processarTudo()
    expect(await casos.vindas.listar(c.recepcao)).toMatchObject([
      { tipo: 'remarcar', inicio: as('15:00'), consultaAtual: { id: consulta.id, inicio: as('10:00'), profissional: { id: c.ana } } },
    ])
  })

  it('o card em Cancelados cancela a consulta; o aviso atrasado, com o card já de volta, não', async () => {
    const c = await clinicaLigada()
    const { card, consulta } = await encaixada(c)
    card.etapa = 'agendados'
    await avisar(c, card, { para: 'cancelados' }) // atrasado: o card já voltou para Agendados
    await processarTudo()
    expect(await consultaDoCard(card.id)).toMatchObject([{ status: 'agendada' }])

    card.etapa = 'cancelados'
    await avisar(c, card, { para: 'cancelados' })
    await processarTudo()
    expect(await consultaDoCard(card.id)).toMatchObject([{ id: consulta.id, status: 'cancelada' }])
    expect(await avisosAoCrmDa(consulta.id)).toEqual([])
  })

  it('o compareceu do CRM conclui a consulta', async () => {
    const c = await clinicaLigada()
    const { card } = await encaixada(c)
    relogio.definir(as('10:40'))
    card.painel = 'crc2'
    card.etapa = 'avaliacao'
    await avisar(c, card, { tipo: 'passou_para_crc2', para: 'avaliacao' })
    await processarTudo()
    expect(await consultaDoCard(card.id)).toMatchObject([{ status: 'concluida' }])
  })

  it('o card que saiu de Agendados tira a vinda pendente da lista', async () => {
    const c = await clinicaLigada({ semVinculos: true })
    const card = cardMarcadoNaClinicorp(c)
    await avisar(c, card)
    await processarTudo()
    expect(await casos.vindas.listar(c.recepcao)).toHaveLength(1)
    card.etapa = 'leads'
    await avisar(c, card, { para: 'leads' })
    await processarTudo()
    expect(await casos.vindas.listar(c.recepcao)).toEqual([])
  })
})
