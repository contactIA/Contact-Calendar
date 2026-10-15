import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { montarCasosDeUso } from '@/composicao'
import type { Acesso } from '@/modulos/acesso/aplicacao/acesso'
import { montarClinicaDaAgenda, type ClinicaDaAgenda } from '../apoio/agenda'
import { bancoDeTeste, relogioDeTeste } from '../apoio/banco'

// Os cadastros da clínica e as chaves da API de ponta a ponta, com os
// adaptadores de verdade num Postgres dentro do processo (PGlite).

let pg: PGlite
let casos: ReturnType<typeof montarCasosDeUso>
const relogio = relogioDeTeste(new Date('2026-10-07T12:00:00Z'))

beforeAll(async () => {
  const teste = await bancoDeTeste()
  pg = teste.pg
  casos = montarCasosDeUso({ banco: teste.banco, relogio })
}, 60_000)
afterAll(() => pg.close())

async function codigoDoErro(promessa: Promise<unknown>) {
  try {
    await promessa
  } catch (e) {
    return (e as { codigo?: string }).codigo ?? String(e)
  }
  return null
}

const gestorDa = (c: ClinicaDaAgenda): Acesso => ({
  tipo: 'usuario',
  clinicaId: c.clinica,
  usuarioId: crypto.randomUUID(),
  nome: 'Gestora',
  papeis: { gestor: true, recepcao: false, dentista: false },
  profissionalId: null,
})

describe('unidades e cadeiras', () => {
  it('o gestor cria e renomeia; nome repetido, sem diferença de maiúscula, é recusado', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    const sul = await casos.cadastros.criarUnidade(gestor, { nome: '  Zona   Sul ', telefone: '' })
    expect(sul).toMatchObject({ nome: 'Zona Sul', telefone: null, ativa: true })
    expect(await codigoDoErro(casos.cadastros.criarUnidade(gestor, { nome: 'zona sul' }))).toBe('NOME_REPETIDO')
    expect(await codigoDoErro(casos.cadastros.alterarUnidade(gestor, sul.id, { nome: 'CENTRO' }))).toBe('NOME_REPETIDO')
    expect((await casos.cadastros.unidades(gestor)).map((u) => u.nome)).toEqual(['Bairro', 'Centro', 'Zona Sul'])

    const cadeira = await casos.cadastros.criarCadeira(gestor, { unidadeId: sul.id, nome: 'Consultório 1' })
    expect(cadeira.unidadeId).toBe(sul.id)
    expect(await codigoDoErro(casos.cadastros.criarCadeira(gestor, { unidadeId: sul.id, nome: 'consultório 1' }))).toBe('NOME_REPETIDO')
    expect((await casos.cadastros.cadeiras(gestor, sul.id)).map((x) => x.nome)).toEqual(['Consultório 1'])
  })

  it('só o gestor cadastra; a recepção e a chave leem', async () => {
    const c = await montarClinicaDaAgenda(pg)
    expect(await codigoDoErro(casos.cadastros.criarUnidade(c.recepcao, { nome: 'Norte' }))).toBe('SO_GESTOR')
    expect(await codigoDoErro(casos.cadastros.criarProcedimento(c.ia, { nome: 'Limpeza', duracaoMinutos: 30 }))).toBe('SO_GESTOR')
    expect((await casos.cadastros.procedimentos(c.ia)).map((p) => p.nome)).toEqual(['Aparelho', 'Avaliação'])
  })

  it('a última unidade ativa não se desativa', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    await casos.cadastros.alterarUnidade(gestor, c.bairro, { ativa: false })
    expect(await codigoDoErro(casos.cadastros.alterarUnidade(gestor, c.centro, { ativa: false }))).toBe('ULTIMA_UNIDADE')
  })

  it('a unidade de outra clínica não existe', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const outra = await montarClinicaDaAgenda(pg)
    expect(await codigoDoErro(casos.cadastros.alterarUnidade(gestorDa(c), outra.centro, { nome: 'X' }))).toBe('UNIDADE_NAO_ENCONTRADA')
  })
})

describe('especialidades e procedimentos', () => {
  it('a especialidade em uso não se apaga; a sem uso, sim', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    expect(await codigoDoErro(casos.cadastros.apagarEspecialidade(gestor, c.ortodontia))).toBe('ESPECIALIDADE_EM_USO')
    const implante = await casos.cadastros.criarEspecialidade(gestor, { nome: 'Implante' })
    await casos.cadastros.apagarEspecialidade(gestor, implante.id)
    expect((await casos.cadastros.especialidades(gestor)).map((e) => e.nome)).toEqual(['Ortodontia'])
  })

  it('o procedimento confere a duração, a cor e a especialidade', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    const manutencao = await casos.cadastros.criarProcedimento(gestor, { nome: 'Manutenção', duracaoMinutos: 30, cor: '#ff0000', especialidadeId: c.ortodontia })
    expect(manutencao).toMatchObject({ cor: '#FF0000', especialidadeId: c.ortodontia, ativo: true })
    expect(await codigoDoErro(casos.cadastros.criarProcedimento(gestor, { nome: 'Rápido', duracaoMinutos: 2 }))).toBe('DURACAO_INVALIDA')
    expect(await codigoDoErro(casos.cadastros.alterarProcedimento(gestor, manutencao.id, { especialidadeId: crypto.randomUUID() }))).toBe(
      'ESPECIALIDADE_NAO_ENCONTRADA'
    )
    const livre = await casos.cadastros.alterarProcedimento(gestor, manutencao.id, { especialidadeId: null, ativo: false })
    expect(livre).toMatchObject({ especialidadeId: null, ativo: false, duracaoMinutos: 30 })
  })
})

describe('profissionais, expedientes e bloqueios', () => {
  it('o profissional nasce com as especialidades e as unidades, e a agenda já o oferece', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    const carla = await casos.cadastros.criarProfissional(gestor, {
      nome: 'Dra. Carla',
      cro: 'GO 1234',
      especialidadeIds: [c.ortodontia],
      unidades: [{ unidadeId: c.centro, prioridade: 0 }],
    })
    expect(carla).toMatchObject({ cor: '#3B82F6', especialidadeIds: [c.ortodontia], unidades: [{ unidadeId: c.centro, prioridade: 0 }] })
    await casos.cadastros.definirExpedientes(gestor, carla.id, [{ unidadeId: c.centro, diaSemana: 4, inicio: '08:00', fim: '10:00' }])

    const livres = await casos.agenda.horariosLivres(c.recepcao, { unidadeId: c.centro, procedimentoId: c.aparelho, data: '2026-10-08' })
    expect(livres.find((l) => l.profissional.id === carla.id)?.horarios).toHaveLength(3) // 8h, 8h30 e 9h
  })

  it('sair de uma unidade apaga os expedientes de lá; a mesma unidade duas vezes é recusada', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    expect((await casos.cadastros.expedientes(gestor, c.bruno)).length).toBe(10)
    const bruno = await casos.cadastros.alterarProfissional(gestor, c.bruno, { unidades: [{ unidadeId: c.bairro, prioridade: 5 }] })
    expect(bruno.unidades).toEqual([{ unidadeId: c.bairro, prioridade: 5 }])
    expect(await casos.cadastros.expedientes(gestor, c.bruno)).toEqual([])
    expect(
      await codigoDoErro(
        casos.cadastros.alterarProfissional(gestor, c.bruno, {
          unidades: [
            { unidadeId: c.bairro, prioridade: 1 },
            { unidadeId: c.bairro, prioridade: 2 },
          ],
        })
      )
    ).toBe('UNIDADE_REPETIDA')
  })

  it('a semana do profissional é trocada inteira, e só em unidade onde ele atende', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    const semana = await casos.cadastros.definirExpedientes(gestor, c.ana, [
      { unidadeId: c.centro, diaSemana: 1, inicio: '08:00', fim: '12:00' },
      { unidadeId: c.bairro, diaSemana: 1, inicio: '13:00', fim: '17:00' },
    ])
    expect(semana).toHaveLength(2)
    expect((await casos.cadastros.expedientes(gestor, c.ana)).map((e) => `${e.diaSemana} ${e.inicio}-${e.fim}`)).toEqual(['1 08:00-12:00', '1 13:00-17:00'])
    expect(
      await codigoDoErro(casos.cadastros.definirExpedientes(gestor, c.bruno, [{ unidadeId: c.bairro, diaSemana: 1, inicio: '08:00', fim: '12:00' }]))
    ).toBe('UNIDADE_SEM_O_PROFISSIONAL')
  })

  it('a recepção bloqueia o profissional, e o horário some da agenda', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const bloqueio = await casos.cadastros.criarBloqueio(c.recepcao, {
      profissionalId: c.ana,
      inicio: new Date('2026-10-08T08:00:00-03:00'),
      fim: new Date('2026-10-08T12:00:00-03:00'),
      tipo: 'reuniao',
      motivo: 'Congresso',
    })
    expect(bloqueio.criadoPorId).toBe((c.recepcao as { usuarioId: string }).usuarioId)
    const livres = await casos.agenda.horariosLivres(c.recepcao, { unidadeId: c.centro, procedimentoId: c.avaliacao, data: '2026-10-08', profissionalId: c.ana })
    expect(livres[0]!.horarios).toHaveLength(7) // só a tarde

    const periodo = { de: new Date('2026-10-08T00:00:00-03:00'), ate: new Date('2026-10-09T00:00:00-03:00') }
    expect(await casos.cadastros.bloqueios(c.dentistaAna, periodo)).toHaveLength(1)
    expect(await codigoDoErro(casos.cadastros.criarBloqueio(c.dentistaAna, { ...bloqueio, tipo: 'ausencia' }))).toBe('SO_RECEPCAO')
    await casos.cadastros.apagarBloqueio(c.recepcao, bloqueio.id)
    expect(await casos.cadastros.bloqueios(c.recepcao, periodo)).toEqual([])
  })
})

describe('a ligação com o CRM nos cadastros (fase 7b)', () => {
  it('o profissional guarda o dentista do prontuário; o mesmo dentista não liga a dois', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    expect(await casos.cadastros.alterarProfissional(gestor, c.ana, { idNoProntuario: ' 4521 ' })).toMatchObject({ idNoProntuario: '4521' })
    expect(await codigoDoErro(casos.cadastros.alterarProfissional(gestor, c.bruno, { idNoProntuario: '4521' }))).toBe('DENTISTA_JA_LIGADO')
    expect(await casos.cadastros.alterarProfissional(gestor, c.ana, { idNoProntuario: '' })).toMatchObject({ idNoProntuario: null })
  })

  it('o gestor escolhe o procedimento das vindas, da clínica e ativo', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const outra = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    await casos.cadastros.definirProcedimentoDasVindas(gestor, c.avaliacao)
    expect((await pg.query<{ p: string }>('select procedimento_das_vindas_id as p from agenda.clinicas where id = $1', [c.clinica])).rows[0]!.p).toBe(c.avaliacao)
    expect(await codigoDoErro(casos.cadastros.definirProcedimentoDasVindas(gestor, outra.avaliacao))).toBe('PROCEDIMENTO_NAO_ENCONTRADO')
    expect(await codigoDoErro(casos.cadastros.definirProcedimentoDasVindas(c.recepcao, null))).toBe('SO_GESTOR')
    await casos.cadastros.definirProcedimentoDasVindas(gestor, null)
  })
})

describe('chaves da API', () => {
  it('a chave criada pelo gestor autentica, confere o X-Clinica e para de valer quando revogada', async () => {
    const c = await montarClinicaDaAgenda(pg)
    const gestor = gestorDa(c)
    const criada = await casos.acesso.criarChave(gestor, { nome: 'Agente', tipo: 'ia', podeEscrever: true })
    expect(criada.chave).toMatch(/^agd_/)
    expect(criada.prefixo).toBe(criada.chave.slice(0, 12))

    const acesso = await casos.acesso.autenticarChave(criada.chave)
    expect(acesso).toMatchObject({ tipo: 'ia', clinicaId: c.clinica, podeEscrever: true })
    const { rows } = await pg.query<{ company_id: string }>(`select company_id from agenda.clinicas where id = $1`, [c.clinica])
    expect((await casos.acesso.autenticarChave(criada.chave, rows[0]!.company_id)).clinicaId).toBe(c.clinica)

    const outra = await montarClinicaDaAgenda(pg)
    expect(await codigoDoErro(casos.acesso.autenticarChave(criada.chave, outra.clinica))).toBe('CLINICA_FORA_DA_CHAVE')
    expect(await codigoDoErro(casos.acesso.autenticarChave('agd_inventada'))).toBe('CHAVE_INVALIDA')

    const listadas = await casos.acesso.listarChaves(gestor)
    expect(listadas[0]).not.toHaveProperty('chave')
    expect(listadas[0]!.ultimoUsoEm).not.toBeNull()

    await casos.acesso.revogarChave(gestor, criada.id)
    expect(await codigoDoErro(casos.acesso.autenticarChave(criada.chave))).toBe('CHAVE_INVALIDA')
    expect(await codigoDoErro(casos.acesso.revogarChave(gestor, criada.id))).toBe('CHAVE_NAO_ENCONTRADA')
  })
})
