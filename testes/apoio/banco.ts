import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { drizzle } from 'drizzle-orm/pglite'
import type { Banco } from '@/infra/banco/conexao'
import * as esquema from '@/infra/banco/esquema'
import { aplicarMigracoes } from '@/infra/banco/migracoes'

// Um Postgres dentro do processo (PGlite) com as migrações reais de ./drizzle.
// Os testes de integração rodam os adaptadores de verdade aqui, sem tocar em
// nenhum banco de fora.
//
// Com as duas extensões que a agenda usa: btree_gist, para as restrições que
// impedem duas consultas no mesmo horário, e unaccent, para a busca sem acento.

const PASTA_DAS_MIGRACOES = join(import.meta.dirname, '../../drizzle')

export async function pgliteDaAgenda(): Promise<PGlite> {
  return PGlite.create({ extensions: { btree_gist, unaccent } })
}

export async function bancoDeTeste(): Promise<{ pg: PGlite; banco: Banco }> {
  const pg = await pgliteDaAgenda()
  await aplicarMigracoes(pg, PASTA_DAS_MIGRACOES)
  const banco = drizzle(pg, { schema: esquema }) as unknown as Banco
  return { pg, banco }
}

/** Um relógio que o teste avança à mão. */
export function relogioDeTeste(inicio = new Date('2026-10-07T12:00:00Z')) {
  let agora = inicio
  return {
    agora: () => agora,
    avancar(ms: number) {
      agora = new Date(agora.getTime() + ms)
    },
    definir(d: Date) {
      agora = d
    },
  }
}
