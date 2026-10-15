import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { STATUS_DA_CONSULTA, STATUS_QUE_OCUPAM_HORARIO } from '@/compartilhado/vocabulario'
import type { Banco } from '@/infra/banco/conexao'
import * as esquema from '@/infra/banco/esquema'
import { bancoDeTeste } from '../apoio/banco'

// Aplica as migrações reais (./drizzle) num Postgres que roda dentro do processo
// (PGlite) e tenta quebrar cada regra que o banco promete garantir
// (docs/modelo-de-dados.md). Nenhum banco de verdade é tocado. Cada teste monta a
// própria clínica, para um não depender do outro.

let pg: PGlite
let banco: Banco
beforeAll(async () => {
  ;({ pg, banco } = await bancoDeTeste())
}, 60_000)
afterAll(() => pg.close())

async function um<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await pg.query<T>(sql, params)
  return rows[0]!
}

/** O banco tem que recusar, com o código do Postgres e o nome da restrição. */
async function recusa(sql: string, params: unknown[], codigo: string, restricao?: string) {
  const erro = await pg.query(sql, params).then(
    () => null,
    (e: unknown) => e as { code?: string; message?: string }
  )
  expect(erro, 'o banco aceitou').not.toBeNull()
  expect(erro!.code).toBe(codigo)
  if (restricao) expect(erro!.message).toContain(restricao)
}

const VIOLA_EXCLUSAO = '23P01'
const VIOLA_CHAVE = '23503'
const VIOLA_UNICO = '23505'
const VIOLA_CHECK = '23514'

/** Uma clínica com duas unidades, três cadeiras, dois profissionais, dois pacientes e um procedimento. */
async function montarClinica() {
  const id = async (sql: string, params: unknown[]) => (await um<{ id: string }>(sql + ' returning id', params)).id
  const clinica = await id(`insert into agenda.clinicas (company_id, nome) values ($1, 'Clínica')`, [crypto.randomUUID()])
  const unidadeA = await id(`insert into agenda.unidades (clinica_id, nome) values ($1, 'Centro')`, [clinica])
  const unidadeB = await id(`insert into agenda.unidades (clinica_id, nome) values ($1, 'Bairro')`, [clinica])
  const cadeira = (unidade: string, nome: string) => id(`insert into agenda.cadeiras (clinica_id, unidade_id, nome) values ($1, $2, $3)`, [clinica, unidade, nome])
  const cadeiraA1 = await cadeira(unidadeA, 'Consultório 1')
  const cadeiraA2 = await cadeira(unidadeA, 'Consultório 2')
  const cadeiraB1 = await cadeira(unidadeB, 'Consultório 1')
  const profissional = (nome: string) => id(`insert into agenda.profissionais (clinica_id, nome) values ($1, $2)`, [clinica, nome])
  const ana = await profissional('Dra. Ana')
  const bruno = await profissional('Dr. Bruno')
  for (const [p, u] of [[ana, unidadeA], [ana, unidadeB], [bruno, unidadeA]]) {
    await pg.query(`insert into agenda.profissional_unidades (clinica_id, profissional_id, unidade_id) values ($1, $2, $3)`, [clinica, p, u])
  }
  const paciente = (nome: string) => id(`insert into agenda.pacientes (clinica_id, nome, telefone) values ($1, $2, '+5562999990000')`, [clinica, nome])
  const maria = await paciente('Maria')
  const joao = await paciente('João')
  const avaliacao = await id(`insert into agenda.procedimentos (clinica_id, nome, duracao_minutos) values ($1, 'Avaliação', 60)`, [clinica])
  return { clinica, unidadeA, unidadeB, cadeiraA1, cadeiraA2, cadeiraB1, ana, bruno, maria, joao, avaliacao }
}
type Clinica = Awaited<ReturnType<typeof montarClinica>>

interface Consulta {
  unidade?: string
  cadeira?: string
  profissional?: string
  paciente?: string
  inicio: string
  fim: string
  status?: string
  canceladaEm?: string | null
}

const SQL_DA_CONSULTA = `insert into agenda.consultas
  (clinica_id, unidade_id, cadeira_id, profissional_id, paciente_id, procedimento_id, inicio, fim, status, cancelada_em, criada_por_tipo)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'usuario')`

function parametros(c: Clinica, x: Consulta) {
  const status = x.status ?? 'agendada'
  const canceladaEm = x.canceladaEm !== undefined ? x.canceladaEm : status === 'cancelada' ? x.inicio : null
  return [c.clinica, x.unidade ?? c.unidadeA, x.cadeira ?? c.cadeiraA1, x.profissional ?? c.ana, x.paciente ?? c.maria, c.avaliacao, x.inicio, x.fim, status, canceladaEm]
}

const consulta = (c: Clinica, x: Consulta) => pg.query(SQL_DA_CONSULTA, parametros(c, x))
const recusaConsulta = (c: Clinica, x: Consulta, codigo: string, restricao: string) => recusa(SQL_DA_CONSULTA, parametros(c, x), codigo, restricao)

describe('migrações', () => {
  it('aplicam do zero e ficam registradas no esquema agenda', async () => {
    const { total } = await um<{ total: number }>(`select count(*)::int as total from agenda.__drizzle_migrations`)
    expect(total).toBe(4)
    const { tabelas } = await um<{ tabelas: number }>(
      `select count(*)::int as tabelas from pg_tables where schemaname = 'agenda' and tablename <> '__drizzle_migrations'`
    )
    expect(tabelas).toBe(19)
  })

  it('toda tabela tem RLS ligado e nenhuma política', async () => {
    const { rows } = await pg.query<{ tablename: string }>(
      `select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'agenda' and c.relkind = 'r' and c.relname <> '__drizzle_migrations' and not c.relrowsecurity`
    )
    expect(rows.map((r) => r.tablename)).toEqual([])
    const { politicas } = await um<{ politicas: number }>(`select count(*)::int as politicas from pg_policies where schemaname = 'agenda'`)
    expect(politicas).toBe(0)
  })

  it('o esquema do Drizzle bate com o banco', async () => {
    const [clinica] = await banco.insert(esquema.clinicas).values({ company_id: crypto.randomUUID(), nome: 'Pelo Drizzle' }).returning()
    expect(clinica).toMatchObject({ cadencia_minutos: 30, fuso_horario: 'America/Sao_Paulo', ligada_ao_crm: false })
    const lida = await banco.select().from(esquema.clinicas).where(eq(esquema.clinicas.id, clinica!.id))
    expect(lida).toHaveLength(1)
  })

  it('a busca sem acento funciona', async () => {
    const { igual } = await um<{ igual: boolean }>(`select extensions.unaccent('João Antônio') = 'Joao Antonio' as igual`)
    expect(igual).toBe(true)
  })
})

describe('ninguém tem duas consultas no mesmo horário', () => {
  it('o profissional', async () => {
    const c = await montarClinica()
    await consulta(c, { inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' })
    // Outra cadeira e outro paciente: só o profissional repete.
    await recusaConsulta(
      c,
      { cadeira: c.cadeiraA2, paciente: c.joao, inicio: '2026-10-08T10:30:00-03:00', fim: '2026-10-08T11:30:00-03:00' },
      VIOLA_EXCLUSAO,
      'consultas_profissional_sem_sobreposicao'
    )
    // Encostar no fim da anterior pode: o intervalo é [início, fim).
    await consulta(c, { cadeira: c.cadeiraA2, paciente: c.joao, inicio: '2026-10-08T11:00:00-03:00', fim: '2026-10-08T11:30:00-03:00' })
  })

  it('a cadeira', async () => {
    const c = await montarClinica()
    await consulta(c, { inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' })
    await recusaConsulta(
      c,
      { profissional: c.bruno, paciente: c.joao, inicio: '2026-10-08T10:15:00-03:00', fim: '2026-10-08T10:45:00-03:00' },
      VIOLA_EXCLUSAO,
      'consultas_cadeira_sem_sobreposicao'
    )
  })

  it('o paciente', async () => {
    const c = await montarClinica()
    await consulta(c, { inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' })
    await recusaConsulta(
      c,
      { profissional: c.bruno, cadeira: c.cadeiraA2, inicio: '2026-10-08T10:30:00-03:00', fim: '2026-10-08T11:30:00-03:00' },
      VIOLA_EXCLUSAO,
      'consultas_paciente_sem_sobreposicao'
    )
  })

  it('só as consultas que ocupam o horário contam, a mesma lista do vocabulário', async () => {
    const c = await montarClinica()
    for (const [i, status] of STATUS_DA_CONSULTA.entries()) {
      const dia = `2026-11-${String(i + 2).padStart(2, '0')}`
      await consulta(c, { inicio: `${dia}T09:00:00-03:00`, fim: `${dia}T10:00:00-03:00`, status })
      const segunda = consulta(c, { cadeira: c.cadeiraA2, paciente: c.joao, inicio: `${dia}T09:30:00-03:00`, fim: `${dia}T10:30:00-03:00` })
      if ((STATUS_QUE_OCUPAM_HORARIO as readonly string[]).includes(status)) {
        await expect(segunda, `${status} deveria ocupar o horário`).rejects.toMatchObject({ code: VIOLA_EXCLUSAO })
      } else {
        await expect(segunda, `${status} deveria liberar o horário`).resolves.toBeDefined()
      }
    }
  })

  it('remarcar para cima de outra consulta também é recusado', async () => {
    const c = await montarClinica()
    await consulta(c, { inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' })
    const { id } = await um<{ id: string }>(SQL_DA_CONSULTA + ' returning id', parametros(c, { cadeira: c.cadeiraA2, paciente: c.joao, inicio: '2026-10-08T14:00:00-03:00', fim: '2026-10-08T15:00:00-03:00' }))
    await recusa(
      `update agenda.consultas set inicio = '2026-10-08T10:30:00-03:00', fim = '2026-10-08T11:30:00-03:00' where id = $1`,
      [id],
      VIOLA_EXCLUSAO,
      'consultas_profissional_sem_sobreposicao'
    )
  })
})

describe('tudo da mesma clínica', () => {
  it('a consulta não usa paciente de outra clínica', async () => {
    const c = await montarClinica()
    const outra = await montarClinica()
    await recusaConsulta(c, { paciente: outra.maria, inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' }, VIOLA_CHAVE, 'consultas_paciente_da_clinica')
  })

  it('a cadeira é da unidade da consulta', async () => {
    const c = await montarClinica()
    await recusaConsulta(
      c,
      { unidade: c.unidadeA, cadeira: c.cadeiraB1, inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' },
      VIOLA_CHAVE,
      'consultas_cadeira_da_unidade'
    )
  })

  it('o profissional não é de outra clínica', async () => {
    const c = await montarClinica()
    const outra = await montarClinica()
    await recusaConsulta(c, { profissional: outra.ana, inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' }, VIOLA_CHAVE, 'consultas_profissional_da_clinica')
  })

  it('o usuário do profissional e a especialidade do procedimento também', async () => {
    const c = await montarClinica()
    const outra = await montarClinica()
    const { id: usuarioDeFora } = await um<{ id: string }>(
      `insert into agenda.usuarios (clinica_id, usuario_plataforma_id, nome, dentista) values ($1, $2, 'Dentista', true) returning id`,
      [outra.clinica, crypto.randomUUID()]
    )
    await recusa(`update agenda.profissionais set usuario_id = $1 where id = $2`, [usuarioDeFora, c.ana], VIOLA_CHAVE, 'profissionais_usuario_da_clinica')
    const { id: especialidadeDeFora } = await um<{ id: string }>(`insert into agenda.especialidades (clinica_id, nome) values ($1, 'Ortodontia') returning id`, [outra.clinica])
    await recusa(`update agenda.procedimentos set especialidade_id = $1 where id = $2`, [especialidadeDeFora, c.avaliacao], VIOLA_CHAVE, 'procedimentos_especialidade_da_clinica')
  })
})

describe('expedientes', () => {
  const SQL = `insert into agenda.expedientes (clinica_id, profissional_id, unidade_id, dia_semana, inicio, fim) values ($1, $2, $3, $4, $5, $6)`

  it('manhã e tarde no mesmo dia pode; cruzar não pode, nem em outra unidade', async () => {
    const c = await montarClinica()
    await pg.query(SQL, [c.clinica, c.ana, c.unidadeA, 1, '08:00', '12:00'])
    await pg.query(SQL, [c.clinica, c.ana, c.unidadeB, 1, '12:00', '18:00'])
    await recusa(SQL, [c.clinica, c.ana, c.unidadeB, 1, '11:00', '13:00'], VIOLA_EXCLUSAO, 'expedientes_sem_sobreposicao')
    // Outro dia da semana, ou outro profissional, não cruza.
    await pg.query(SQL, [c.clinica, c.ana, c.unidadeA, 2, '08:00', '12:00'])
    await pg.query(SQL, [c.clinica, c.bruno, c.unidadeA, 1, '08:00', '12:00'])
  })

  it('só numa unidade onde o profissional atende, com o fim depois do início e o dia válido', async () => {
    const c = await montarClinica()
    await recusa(SQL, [c.clinica, c.bruno, c.unidadeB, 1, '08:00', '12:00'], VIOLA_CHAVE, 'expedientes_onde_o_profissional_atende')
    await recusa(SQL, [c.clinica, c.ana, c.unidadeA, 1, '12:00', '08:00'], VIOLA_CHECK, 'expedientes_fim_depois_do_inicio')
    await recusa(SQL, [c.clinica, c.ana, c.unidadeA, 7, '08:00', '12:00'], VIOLA_CHECK, 'expedientes_dia_semana')
  })

  it('sair da unidade leva os expedientes de lá junto', async () => {
    const c = await montarClinica()
    await pg.query(SQL, [c.clinica, c.ana, c.unidadeB, 3, '08:00', '12:00'])
    await pg.query(`delete from agenda.profissional_unidades where profissional_id = $1 and unidade_id = $2`, [c.ana, c.unidadeB])
    const { total } = await um<{ total: number }>(`select count(*)::int as total from agenda.expedientes where profissional_id = $1`, [c.ana])
    expect(total).toBe(0)
  })
})

describe('cadastros', () => {
  it('nomes não repetem na clínica, sem diferença de maiúsculas', async () => {
    const c = await montarClinica()
    await recusa(`insert into agenda.unidades (clinica_id, nome) values ($1, 'CENTRO')`, [c.clinica], VIOLA_UNICO, 'unidades_nome')
    await pg.query(`insert into agenda.especialidades (clinica_id, nome) values ($1, 'Ortodontia')`, [c.clinica])
    await recusa(`insert into agenda.especialidades (clinica_id, nome) values ($1, 'ortodontia')`, [c.clinica], VIOLA_UNICO, 'especialidades_nome')
    await recusa(`insert into agenda.procedimentos (clinica_id, nome, duracao_minutos) values ($1, 'avaliação', 30)`, [c.clinica], VIOLA_UNICO, 'procedimentos_nome')
  })

  it('o nome da cadeira repete entre unidades, mas não na mesma', async () => {
    const c = await montarClinica()
    // "Consultório 1" já existe nas duas unidades (montarClinica).
    await recusa(`insert into agenda.cadeiras (clinica_id, unidade_id, nome) values ($1, $2, 'consultório 1')`, [c.clinica, c.unidadeA], VIOLA_UNICO, 'cadeiras_nome')
  })

  it('o usuário tem pelo menos um papel e é no máximo um profissional', async () => {
    const c = await montarClinica()
    await recusa(
      `insert into agenda.usuarios (clinica_id, usuario_plataforma_id, nome) values ($1, $2, 'Sem papel')`,
      [c.clinica, crypto.randomUUID()],
      VIOLA_CHECK,
      'usuarios_com_papel'
    )
    const { id: usuario } = await um<{ id: string }>(
      `insert into agenda.usuarios (clinica_id, usuario_plataforma_id, nome, dentista) values ($1, $2, 'Dra. Ana', true) returning id`,
      [c.clinica, crypto.randomUUID()]
    )
    await pg.query(`update agenda.profissionais set usuario_id = $1 where id = $2`, [usuario, c.ana])
    await recusa(`update agenda.profissionais set usuario_id = $1 where id = $2`, [usuario, c.bruno], VIOLA_UNICO, 'profissionais_usuario')
  })

  it('a duração do procedimento vai de 5 minutos a 8 horas', async () => {
    const c = await montarClinica()
    for (const duracao of [0, 4, 481]) {
      await recusa(`insert into agenda.procedimentos (clinica_id, nome, duracao_minutos) values ($1, $2, $3)`, [c.clinica, `P${duracao}`, duracao], VIOLA_CHECK, 'procedimentos_duracao')
    }
  })

  it('a clínica: cadência da lista e a conta da plataforma sem repetir', async () => {
    const c = await montarClinica()
    await recusa(`update agenda.clinicas set cadencia_minutos = 25 where id = $1`, [c.clinica], VIOLA_CHECK, 'clinicas_cadencia')
    const { company_id } = await um<{ company_id: string }>(`select company_id from agenda.clinicas where id = $1`, [c.clinica])
    await recusa(`insert into agenda.clinicas (company_id, nome) values ($1, 'De novo')`, [company_id], VIOLA_UNICO, 'clinicas_company_id_unique')
  })

  it('o telefone do paciente é E.164 e pode repetir na clínica (a família no mesmo número)', async () => {
    const c = await montarClinica()
    // Maria e João já têm o mesmo número (montarClinica).
    const { total } = await um<{ total: number }>(`select count(*)::int as total from agenda.pacientes where clinica_id = $1 and telefone = '+5562999990000'`, [c.clinica])
    expect(total).toBe(2)
    await recusa(`insert into agenda.pacientes (clinica_id, nome, telefone) values ($1, 'Errado', '(62) 99999-0000')`, [c.clinica], VIOLA_CHECK, 'pacientes_telefone_e164')
    await pg.query(`insert into agenda.pacientes (clinica_id, nome) values ($1, 'Sem telefone')`, [c.clinica])
  })

  it('o bloqueio tem tipo da lista e fim depois do início', async () => {
    const c = await montarClinica()
    const SQL = `insert into agenda.bloqueios (clinica_id, profissional_id, inicio, fim, tipo) values ($1, $2, $3, $4, $5)`
    await pg.query(SQL, [c.clinica, c.ana, '2026-10-08T12:00:00-03:00', '2026-10-08T13:00:00-03:00', 'intervalo'])
    await recusa(SQL, [c.clinica, c.ana, '2026-10-08T13:00:00-03:00', '2026-10-08T12:00:00-03:00', 'intervalo'], VIOLA_CHECK, 'bloqueios_fim_depois_do_inicio')
    await recusa(SQL, [c.clinica, c.ana, '2026-10-08T12:00:00-03:00', '2026-10-08T13:00:00-03:00', 'ferias'], VIOLA_CHECK, 'bloqueios_tipo')
  })
})

describe('a consulta', () => {
  it('cancelada sempre com a data, e só ela', async () => {
    const c = await montarClinica()
    await recusaConsulta(c, { status: 'cancelada', canceladaEm: null, inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' }, VIOLA_CHECK, 'consultas_cancelada_com_data')
    await recusaConsulta(
      c,
      { status: 'agendada', canceladaEm: '2026-10-07T10:00:00-03:00', inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' },
      VIOLA_CHECK,
      'consultas_cancelada_com_data'
    )
  })

  it('status da lista e fim depois do início', async () => {
    const c = await montarClinica()
    await recusaConsulta(c, { status: 'remarcada', inicio: '2026-10-08T10:00:00-03:00', fim: '2026-10-08T11:00:00-03:00' }, VIOLA_CHECK, 'consultas_status')
    await recusaConsulta(c, { inicio: '2026-10-08T11:00:00-03:00', fim: '2026-10-08T10:00:00-03:00' }, VIOLA_CHECK, 'consultas_fim_depois_do_inicio')
  })
})

describe('histórico e caixa de saída', () => {
  it('o histórico só aceita inserção', async () => {
    const c = await montarClinica()
    const { id } = await um<{ id: number }>(
      `insert into agenda.eventos (clinica_id, paciente_id, tipo, ator_tipo) values ($1, $2, 'paciente_criado', 'sistema') returning id`,
      [c.clinica, c.maria]
    )
    await expect(pg.query(`update agenda.eventos set tipo = 'paciente_alterado' where id = $1`, [id])).rejects.toThrow('só aceita inserção')
    await expect(pg.query(`delete from agenda.eventos where id = $1`, [id])).rejects.toThrow('só aceita inserção')
    await expect(pg.query(`truncate agenda.eventos`)).rejects.toThrow('só aceita inserção')
    await recusa(`insert into agenda.eventos (clinica_id, tipo, ator_tipo) values ($1, 'consulta_alterada', 'sistema')`, [c.clinica], VIOLA_CHECK, 'eventos_de_alguem')
  })

  it('o aviso vai só ao CRM, com um tipo da lista (a agenda não manda mensagem)', async () => {
    const c = await montarClinica()
    const SQL = `insert into agenda.caixa_de_saida (clinica_id, paciente_id, destino, tipo) values ($1, $2, $3, $4)`
    await pg.query(SQL, [c.clinica, c.maria, 'crm', 'consulta_criada'])
    await recusa(SQL, [c.clinica, c.maria, 'crm', 'enviar_confirmacao'], VIOLA_CHECK, 'caixa_de_saida_tipo_do_destino')
    await recusa(SQL, [c.clinica, c.maria, 'plataforma', 'agendar_lembrete'], VIOLA_CHECK, 'caixa_de_saida_destino')
  })
})

describe('entrada do CRM (fase 7b)', () => {
  const VINDA = `insert into agenda.vindas_do_crm (clinica_id, crm_card_id, telefone, inicio, situacao) values ($1, $2, $3, '2026-10-08T13:00:00Z', $4)`

  it('uma vinda pendente por card; as resolvidas não contam', async () => {
    const c = await montarClinica()
    const card = crypto.randomUUID()
    await pg.query(VINDA, [c.clinica, card, '+5562999990000', 'descartada'])
    await pg.query(VINDA, [c.clinica, card, '+5562999990000', 'pendente'])
    await recusa(VINDA, [c.clinica, card, '+5562999990000', 'pendente'], VIOLA_UNICO, 'vindas_do_crm_pendente_do_card')
  })

  it('a vinda só aceita telefone E.164 e situação da lista', async () => {
    const c = await montarClinica()
    await recusa(VINDA, [c.clinica, crypto.randomUUID(), '62999990000', 'pendente'], VIOLA_CHECK, 'vindas_do_crm_telefone_e164')
    await recusa(VINDA, [c.clinica, crypto.randomUUID(), '+5562999990000', 'esquecida'], VIOLA_CHECK, 'vindas_do_crm_situacao')
  })

  it('a unidade da vinda é da mesma clínica', async () => {
    const c = await montarClinica()
    const outra = await montarClinica()
    await recusa(
      `insert into agenda.vindas_do_crm (clinica_id, crm_card_id, telefone, inicio, unidade_id) values ($1, $2, '+5562999990000', now(), $3)`,
      [c.clinica, crypto.randomUUID(), outra.unidadeA],
      VIOLA_CHAVE,
      'vindas_do_crm_unidade_da_clinica'
    )
  })

  it('o dentista do prontuário liga a um profissional só na clínica', async () => {
    const c = await montarClinica()
    await pg.query(`update agenda.profissionais set id_no_prontuario = 'clinicorp-1' where id = $1`, [c.ana])
    await recusa(`update agenda.profissionais set id_no_prontuario = 'clinicorp-1' where id = $1`, [c.bruno], VIOLA_UNICO, 'profissionais_no_prontuario')
    const outra = await montarClinica()
    await pg.query(`update agenda.profissionais set id_no_prontuario = 'clinicorp-1' where id = $1`, [outra.ana])
  })

  it('a mesma entrega do CRM entra uma vez só', async () => {
    const c = await montarClinica()
    const ENTRADA = `insert into agenda.entradas_do_crm (clinica_id, entrega_id, evento, tipo, corpo) values ($1, 42, 'card.movido', 'movido', '{}')`
    await pg.query(ENTRADA, [c.clinica])
    await recusa(ENTRADA, [c.clinica], VIOLA_UNICO, 'entradas_do_crm_entrega')
  })
})
