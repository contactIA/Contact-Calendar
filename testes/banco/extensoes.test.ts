import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pgliteDaAgenda } from '../apoio/banco'

// O PGlite dos testes precisa das mesmas extensões que o banco de produção vai
// ter. Este teste prova que elas carregam e fazem o que a agenda precisa delas,
// antes de as tabelas de verdade chegarem (fase 3).

let pg: PGlite
beforeAll(async () => {
  pg = await pgliteDaAgenda()
  await pg.exec(`create extension if not exists btree_gist; create extension if not exists unaccent;`)
}, 60_000)
afterAll(() => pg.close())

describe('extensões do banco de teste', () => {
  it('btree_gist: a restrição de exclusão recusa duas consultas no mesmo horário do profissional', async () => {
    await pg.exec(`
      create table consulta (
        profissional uuid not null,
        periodo tstzrange not null,
        exclude using gist (profissional with =, periodo with &&)
      );
    `)
    const profissional = crypto.randomUUID()
    await pg.query(`insert into consulta values ($1, tstzrange('2026-10-08 10:00-03', '2026-10-08 11:00-03'))`, [profissional])
    // Encostar no fim da anterior pode: o intervalo é [início, fim).
    await pg.query(`insert into consulta values ($1, tstzrange('2026-10-08 11:00-03', '2026-10-08 11:30-03'))`, [profissional])

    await expect(
      pg.query(`insert into consulta values ($1, tstzrange('2026-10-08 10:30-03', '2026-10-08 11:15-03'))`, [profissional])
    ).rejects.toMatchObject({ code: '23P01' })
  })

  it('unaccent: a busca ignora acento', async () => {
    const { rows } = await pg.query<{ igual: boolean }>(`select unaccent('João Antônio') = 'Joao Antonio' as igual`)
    expect(rows[0]!.igual).toBe(true)
  })
})
