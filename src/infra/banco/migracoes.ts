import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Aplica as migrações de ./drizzle, na ordem do journal, num banco que executa SQL
// cru, e registra cada uma em agenda.__drizzle_migrations como o Drizzle registra
// (o hash do arquivo e o instante do journal). A que já está registrada é pulada.
// Serve ao PGlite dos testes, que fica igual ao de produção: lá quem aplica é a
// equipe, com OK explícito (AGENTS.md), e registra na mesma tabela.

interface EntradaDoJournal {
  tag: string
  when: number
}

interface BancoDeSqlCru {
  exec(sql: string): Promise<unknown>
  query<T>(sql: string): Promise<{ rows: T[] }>
}

async function jaRegistradas(banco: BancoDeSqlCru): Promise<Set<number>> {
  const [tabela] = (await banco.query<{ existe: string | null }>(`select to_regclass('agenda.__drizzle_migrations')::text as existe`)).rows
  if (!tabela?.existe) return new Set()
  const { rows } = await banco.query<{ created_at: string | number }>(`select created_at from agenda.__drizzle_migrations`)
  return new Set(rows.map((r) => Number(r.created_at)))
}

/** Aplica as que faltam e devolve os nomes delas, na ordem. */
export async function aplicarMigracoes(banco: BancoDeSqlCru, pasta = join(process.cwd(), 'drizzle')): Promise<string[]> {
  const caminhoDoJournal = join(pasta, 'meta', '_journal.json')
  if (!existsSync(caminhoDoJournal)) return []
  const journal = JSON.parse(readFileSync(caminhoDoJournal, 'utf8')) as { entries: EntradaDoJournal[] }
  const registradas = await jaRegistradas(banco)
  const aplicadas: string[] = []
  for (const { tag, when } of journal.entries) {
    if (registradas.has(when)) continue
    const conteudo = readFileSync(join(pasta, `${tag}.sql`), 'utf8')
    for (const comando of conteudo.split('--> statement-breakpoint')) {
      if (comando.trim()) await banco.exec(comando)
    }
    // A tabela de controle só existe depois da primeira migração, que cria o esquema agenda.
    const hash = createHash('sha256').update(conteudo).digest('hex')
    await banco.exec(
      `create table if not exists agenda.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint);
       insert into agenda.__drizzle_migrations (hash, created_at) values ('${hash}', ${Number(when)});`
    )
    aplicadas.push(tag)
  }
  return aplicadas
}
