import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montarCasosDeUso } from '@/composicao'
import type { Banco } from '@/infra/banco/conexao'
import type { Acesso } from '@/modulos/acesso/aplicacao/acesso'
import { unidadeDeTrabalhoPostgres } from '@/modulos/agenda/infraestrutura/repositorios-postgres'
import { montarClinicaDaAgenda, type ClinicaDaAgenda } from '../apoio/agenda'
import { bancoDeTeste, relogioDeTeste } from '../apoio/banco'

// Os casos de uso da agenda de ponta a ponta, com os repositórios de verdade num
// Postgres dentro do processo (PGlite, com as migrações reais). Agora é quarta,
// 07/10/2026, 9h em São Paulo; as consultas são na quinta, 08/10.

let pg: PGlite
let banco: Banco
const relogio = relogioDeTeste(new Date('2026-10-07T12:00:00Z'))
let casos: ReturnType<typeof montarCasosDeUso>['agenda']

beforeAll(async () => {
  ;({ pg, banco } = await bancoDeTeste())
  casos = montarCasosDeUso({ banco, relogio }).agenda
}, 60_000)
afterAll(() => pg.close())

const QUINTA = '2026-10-08'
const as = (hora: string, dia = QUINTA) => new Date(`${dia}T${hora}:00-03:00`)
const horaDe = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

async function codigoDoErro(promessa: Promise<unknown>) {
  try {
    await promessa
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e)
  }
  return null
}

async function avisos(consultaId: string) {
  const { rows } = await pg.query<{ destino: string; tipo: string; dados: Record<string, unknown> }>(
    `select destino, tipo, dados from agenda.caixa_de_saida where consulta_id = $1 order by id`,
    [consultaId]
  )
  return rows
}

async function eventosDa(consultaId: string) {
  const { rows } = await pg.query<{ tipo: string; ator_tipo: string; dados: Record<string, unknown> }>(
    `select tipo, ator_tipo, dados from agenda.eventos where consulta_id = $1 order by id`,
    [consultaId]
  )
  return rows
}

const agendar = (c: ClinicaDaAgenda, extra: Partial<Parameters<typeof casos.agendar>[1]> = {}, acesso: Acesso = c.recepcao) =>
  casos.agendar(acesso, {
    unidadeId: c.centro,
    profissionalId: c.ana,
    procedimentoId: c.avaliacao,
    inicio: as('10:00'),
    paciente: { nome: 'Maria Souza', telefone: '(62) 99999-0000' },
    ...extra,
  })

describe('horários livres', () => {
  it('cada profissional com os horários do expediente, de meia em meia hora', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const livres = await casos.horariosLivres(c.recepcao, { unidadeId: c.centro, procedimentoId: c.avaliacao, data: QUINTA })
    expect(livres.map((l) => l.profissional.nome)).toEqual(['Dr. Bruno', 'Dra. Ana'])
    const daAna = livres.find((l) => l.profissional.id === c.ana)!.horarios
    expect(daAna).toHaveLength(14) // 8h a 11h e 14h a 17h, de 30 em 30 minutos
    expect(horaDe(daAna[0]!.inicio)).toBe('08:00')
    expect(daAna[0]!.cadeiraId).toBe(c.consultorio1)
  })

  it('o procedimento que exige especialidade só traz quem a tem', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const livres = await casos.horariosLivres(c.recepcao, { unidadeId: c.centro, procedimentoId: c.aparelho, data: QUINTA })
    expect(livres.map((l) => l.profissional.id)).toEqual([c.ana])
  })

  it('a consulta marcada tira os horários que cruzam com ela, e a cancelada devolve', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c)
    const doDia = async () =>
      (await casos.horariosLivres(c.recepcao, { unidadeId: c.centro, procedimentoId: c.avaliacao, data: QUINTA, profissionalId: c.ana }))[0]!.horarios.map((h) => horaDe(h.inicio))
    expect(await doDia()).not.toContain('09:30')
    expect(await doDia()).not.toContain('10:00')
    expect(await doDia()).not.toContain('10:30')
    expect(await doDia()).toContain('09:00')
    await casos.mudarStatus(c.recepcao, consulta.id, { status: 'cancelada' })
    expect(await doDia()).toContain('10:00')
  })
})

describe('agendar', () => {
  it('grava a consulta, cadastra o paciente novo e enfileira os avisos', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta, paciente } = await agendar(c)
    expect(consulta).toMatchObject({ status: 'agendada', cadeiraId: c.consultorio1, criadaPorTipo: 'usuario', versao: 1 })
    expect(consulta.fim.getTime() - consulta.inicio.getTime()).toBe(60 * 60_000)
    expect(paciente).toMatchObject({ nome: 'Maria Souza', telefone: '+5562999990000' })

    expect((await eventosDa(consulta.id)).map((e) => e.tipo)).toEqual(['consulta_criada'])
    const fila = await avisos(consulta.id)
    expect(fila.map((a) => `${a.destino}:${a.tipo}`)).toEqual(['crm:consulta_criada', 'plataforma:enviar_confirmacao', 'plataforma:agendar_lembrete', 'plataforma:etiquetar_contato'])
    expect(fila[0]!.dados).toMatchObject({ telefone: '+5562999990000', nome: 'Maria Souza', profissional: 'Dra. Ana', procedimento: 'Avaliação' })
    expect(fila[3]!.dados).toMatchObject({ etiquetaId: 'etiqueta-agendou' })

    const { rows } = await pg.query<{ tipo: string }>(`select tipo from agenda.caixa_de_saida where paciente_id = $1 and consulta_id is null`, [paciente.id])
    expect(rows.map((r) => r.tipo)).toEqual(['sincronizar_contato'])
  })

  it('a clínica desligada do CRM não manda aviso ao CRM', async () => {
    const c = await montarClinicaDaAgenda(pg, { ligadaAoCrm: false })
    const { consulta } = await agendar(c)
    expect((await avisos(consulta.id)).some((a) => a.destino === 'crm')).toBe(false)
  })

  it('recusa com o motivo: profissional ocupado, paciente ocupado, sem especialidade', async () => {
    const c = await montarClinicaDaAgenda(pg)
    await agendar(c)
    expect(await codigoDoErro(agendar(c, { inicio: as('10:30'), paciente: { nome: 'João', telefone: '62988887777' } }))).toBe('HORARIO_DO_PROFISSIONAL_OCUPADO')
    expect(await codigoDoErro(agendar(c, { profissionalId: c.bruno, inicio: as('10:30') }))).toBe('PACIENTE_JA_TEM_CONSULTA')
    expect(await codigoDoErro(agendar(c, { profissionalId: c.bruno, procedimentoId: c.aparelho, inicio: as('15:00') }))).toBe('PROFISSIONAL_SEM_ESPECIALIDADE')
  })

  it('duas cadeiras: a segunda consulta do mesmo horário vai para a outra', async () => {
    const c = await montarClinicaDaAgenda(pg)
    await agendar(c)
    const { consulta } = await agendar(c, { profissionalId: c.bruno, paciente: { nome: 'João', telefone: '62988887777' } })
    expect(consulta.cadeiraId).toBe(c.consultorio2)
    expect(await codigoDoErro(agendar(c, { profissionalId: c.bruno, inicio: as('10:00'), paciente: { nome: 'Lia', telefone: '62977776666' } }))).toBe(
      'HORARIO_DO_PROFISSIONAL_OCUPADO'
    )
  })

  it('o pedido que chega ao mesmo tempo esbarra na restrição do banco, com o mesmo erro de domínio', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c)
    const uow = unidadeDeTrabalhoPostgres(banco)
    const igual = { ...consulta, id: crypto.randomUUID(), cadeiraId: c.consultorio2 }
    expect(await codigoDoErro(uow.executar((r) => r.consultas.inserir(igual)))).toBe('HORARIO_DO_PROFISSIONAL_OCUPADO')
  })

  it('a chave do agente só marca no futuro e dentro do expediente; a recepção pode encaixar', async () => {
    const c = await montarClinicaDaAgenda(pg)
    expect(await codigoDoErro(agendar(c, { inicio: as('12:30') }, c.ia))).toBe('FORA_DO_EXPEDIENTE')
    expect(await codigoDoErro(agendar(c, { inicio: as('08:00', '2026-10-07') }, c.ia))).toBe('HORARIO_NO_PASSADO')
    const encaixe = await agendar(c, { inicio: as('12:30') })
    expect(encaixe.consulta.status).toBe('agendada')
    const daIa = await agendar(c, { inicio: as('15:00'), paciente: { nome: 'João', telefone: '62988887777' } }, c.ia)
    expect(daIa.consulta.criadaPorTipo).toBe('ia')
  })

  it('o dentista não agenda', async () => {
    const c = await montarClinicaDaAgenda(pg)
    expect(await codigoDoErro(agendar(c, {}, c.dentistaAna))).toBe('SO_RECEPCAO')
  })
})

describe('a família no mesmo telefone', () => {
  it('outro nome no mesmo número é outro paciente; o nome desempata depois', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const mae = await agendar(c)
    const filho = await agendar(c, { profissionalId: c.bruno, inicio: as('14:00'), paciente: { nome: 'Pedro Souza', telefone: '62999990000' } })
    expect(filho.paciente.id).not.toBe(mae.paciente.id)
    // De novo para a mãe, só pelo primeiro nome: acha a mesma.
    const outra = await agendar(c, { inicio: as('16:00'), paciente: { nome: 'maria', telefone: '62999990000' } })
    expect(outra.paciente.id).toBe(mae.paciente.id)

    expect(await codigoDoErro(casos.cancelarProxima(c.ia, { telefone: '62999990000' }))).toBe('PACIENTE_AMBIGUO')
    const cancelada = await casos.cancelarProxima(c.ia, { telefone: '62999990000', nome: 'Pedro' })
    expect(cancelada.id).toBe(filho.consulta.id)
    expect(cancelada.status).toBe('cancelada')
  })

  it('cadastrar de novo o mesmo nome no mesmo número é recusado', async () => {
    const c = await montarClinicaDaAgenda(pg)
    await casos.criarPaciente(c.recepcao, { nome: 'Lia Prado', telefone: '62977776666' })
    expect(await codigoDoErro(casos.criarPaciente(c.recepcao, { nome: 'LIA PRADO', telefone: '+55 62 97777-6666' }))).toBe('PACIENTE_JA_EXISTE')
  })
})

describe('remarcar', () => {
  it('muda o horário, volta para agendada, sobe a versão e avisa', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c)
    await casos.mudarStatus(c.ia, consulta.id, { status: 'confirmada' })
    const remarcada = await casos.remarcar(c.recepcao, consulta.id, { inicio: as('15:00') })
    expect(remarcada).toMatchObject({ status: 'agendada', versao: 3 })
    expect(horaDe(remarcada.inicio)).toBe('15:00')
    expect((await eventosDa(consulta.id)).map((e) => e.tipo)).toEqual(['consulta_criada', 'status_mudou', 'consulta_remarcada'])
    expect((await avisos(consulta.id)).slice(-3).map((a) => a.tipo)).toEqual(['consulta_remarcada', 'cancelar_lembrete', 'agendar_lembrete'])
  })

  it('não remarca para cima de si mesma por engano, e a versão velha é recusada', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c)
    // Para 10:30 cruza com a própria consulta, que não conta.
    const remarcada = await casos.remarcar(c.recepcao, consulta.id, { inicio: as('10:30'), versao: 1 })
    expect(horaDe(remarcada.inicio)).toBe('10:30')
    expect(await codigoDoErro(casos.remarcar(c.recepcao, consulta.id, { inicio: as('11:00'), versao: 1 }))).toBe('CONSULTA_ALTERADA')
  })

  it('cancelada não se remarca: marca-se outra', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c)
    await casos.mudarStatus(c.recepcao, consulta.id, { status: 'cancelada', motivo: 'viajou' })
    expect(await codigoDoErro(casos.remarcar(c.recepcao, consulta.id, { inicio: as('15:00') }))).toBe('CONSULTA_NAO_REMARCAVEL')
  })
})

describe('mudar o status', () => {
  it('o dentista marca a chegada da consulta dele, e o CRM fica sabendo que o paciente compareceu', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c)
    const chegou = await casos.mudarStatus(c.dentistaAna, consulta.id, { status: 'em_atendimento' })
    expect(chegou.status).toBe('em_atendimento')
    await casos.mudarStatus(c.dentistaAna, consulta.id, { status: 'concluida' })
    const fila = (await avisos(consulta.id)).map((a) => a.tipo)
    expect(fila.filter((t) => t === 'paciente_compareceu')).toHaveLength(1)
    expect((await eventosDa(consulta.id)).filter((e) => e.tipo === 'status_mudou').map((e) => e.dados)).toEqual([
      { de: 'agendada', para: 'em_atendimento' },
      { de: 'em_atendimento', para: 'concluida' },
    ])
  })

  it('a consulta de outro dentista não existe para ele', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c, { profissionalId: c.bruno })
    expect(await codigoDoErro(casos.mudarStatus(c.dentistaAna, consulta.id, { status: 'em_atendimento' }))).toBe('CONSULTA_NAO_ENCONTRADA')
  })

  it('a falta avisa o CRM e etiqueta o contato', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c)
    await casos.mudarStatus(c.recepcao, consulta.id, { status: 'faltou' })
    const fila = await avisos(consulta.id)
    expect(fila.slice(-2).map((a) => `${a.tipo}:${a.dados.etiquetaId ?? ''}`)).toEqual(['paciente_faltou:', 'etiquetar_contato:etiqueta-faltou'])
  })

  it('a chave do agente não marca falta', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta } = await agendar(c)
    expect(await codigoDoErro(casos.mudarStatus(c.ia, consulta.id, { status: 'faltou' }))).toBe('STATUS_PROIBIDO')
  })
})

describe('recomendar, para o agente', () => {
  it('quem já atendeu o paciente vem primeiro; sem histórico, quem tem menos consultas no dia, depois a prioridade', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const pedido = { unidadeId: c.centro, procedimentoId: c.avaliacao, data: QUINTA, telefone: '62999990000', nome: 'Maria Souza' }
    // Sem histórico e com o dia vazio: a prioridade (Ana 1, Bruno 2).
    expect((await casos.recomendar(c.ia, pedido)).recomendado?.profissional.id).toBe(c.ana)

    // A Ana ganha duas consultas na quinta: o Bruno, mais livre, passa à frente.
    await agendar(c, { paciente: { nome: 'Lia', telefone: '62977776666' } })
    await agendar(c, { inicio: as('14:00'), paciente: { nome: 'Rui', telefone: '62966665555' } })
    expect((await casos.recomendar(c.ia, pedido)).recomendado?.profissional.id).toBe(c.bruno)

    // A Maria foi atendida pela Ana: a Ana volta para o primeiro lugar.
    const antiga = await agendar(c, { inicio: as('09:00', '2026-10-09') })
    await casos.mudarStatus(c.recepcao, antiga.consulta.id, { status: 'concluida' })
    const comHistorico = await casos.recomendar(c.ia, pedido)
    expect(comHistorico.recomendado).toMatchObject({ profissional: { id: c.ana }, motivo: 'Já atendeu o paciente' })
    expect(comHistorico.alternativas.map((a) => a.profissional.id)).toEqual([c.bruno])
    expect(comHistorico.paciente?.nome).toBe('Maria Souza')
  })
})

describe('leituras', () => {
  it('a agenda do período: a recepção vê todas, o dentista só a dele', async () => {
    const c = await montarClinicaDaAgenda(pg)
    await agendar(c)
    await agendar(c, { profissionalId: c.bruno, inicio: as('14:00'), paciente: { nome: 'João', telefone: '62988887777' } })
    const periodo = { de: as('00:00'), ate: as('23:59') }
    const daRecepcao = await casos.agendaDoPeriodo(c.recepcao, periodo)
    expect(daRecepcao.map((x) => x.profissional.nome)).toEqual(['Dra. Ana', 'Dr. Bruno'])
    expect(daRecepcao[0]).toMatchObject({ paciente: { nome: 'Maria Souza' }, procedimento: { nome: 'Avaliação' }, cadeira: { nome: 'Consultório 1' } })
    expect((await casos.agendaDoPeriodo(c.dentistaAna, periodo)).map((x) => x.profissional.nome)).toEqual(['Dra. Ana'])
    expect(await codigoDoErro(casos.agendaDoPeriodo(c.recepcao, { de: as('10:00'), ate: as('09:00') }))).toBe('PERIODO_INVALIDO')
  })

  it('busca de paciente sem acento e pelo telefone', async () => {
    const c = await montarClinicaDaAgenda(pg)
    await casos.criarPaciente(c.recepcao, { nome: 'João Antônio', telefone: '62955554444' })
    expect((await casos.buscarPacientes(c.recepcao, 'joao antonio')).map((p) => p.nome)).toEqual(['João Antônio'])
    expect((await casos.buscarPacientes(c.recepcao, '5555-4444')).map((p) => p.nome)).toEqual(['João Antônio'])
  })

  it('a próxima consulta e o histórico do paciente', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const { consulta, paciente } = await agendar(c)
    expect((await casos.proximaConsulta(c.ia, { telefone: '62999990000' }))?.id).toBe(consulta.id)
    await casos.mudarStatus(c.recepcao, consulta.id, { status: 'concluida' })
    expect(await casos.proximaConsulta(c.ia, { telefone: '62999990000' })).toBeNull()
    const historico = await casos.historicoDoPaciente(c.recepcao, paciente.id)
    expect(historico.ultimaVisita?.id).toBe(consulta.id)
    expect(historico.consultas).toHaveLength(1)
  })
})
