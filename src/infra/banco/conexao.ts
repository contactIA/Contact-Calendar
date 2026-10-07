import { sql, type ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as esquema from './esquema'

// Conexão direta com o Postgres (ADR 0001): é o que permite gravar a consulta e o
// aviso para o CRM na mesma transação. O cliente REST do Supabase não faz
// transação com vários passos.

export type Esquema = typeof esquema

/**
 * O banco visto pelos adaptadores. É o tipo comum do Postgres de verdade
 * (postgres-js) e do PGlite dos testes: o mesmo código de repositório roda nos
 * dois, e uma transação também serve onde se pede um banco.
 */
export type Banco = PgDatabase<PgQueryResultHKT, Esquema>
export type Transacao = PgTransaction<PgQueryResultHKT, Esquema, ExtractTablesWithRelations<Esquema>>

function criarBanco(): Banco {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL ausente: configure a conexão com o Postgres no .env')

  // prepare: false porque o pooler do Supabase em modo transação não aceita
  // prepared statements. Funciona também no modo sessão.
  const cliente = postgres(url, { prepare: false, max: Number(process.env.DATABASE_MAX_CONEXOES) || 10 })
  return drizzle(cliente, { schema: esquema }) as unknown as Banco
}

let banco: Banco | null = null

/** Uma conexão por processo, criada no primeiro uso: o build não precisa de banco. */
export function obterBanco(): Banco {
  banco ??= criarBanco()
  return banco
}

/** Se o banco responde a um `select 1` dentro do limite. Serve à rota de saúde. */
export async function bancoResponde(db: Banco, limiteMs = 3_000): Promise<boolean> {
  let limite: ReturnType<typeof setTimeout> | undefined
  const esgotou = new Promise<false>((responder) => {
    limite = setTimeout(() => responder(false), limiteMs)
  })
  try {
    return await Promise.race([db.execute(sql`select 1`).then(() => true), esgotou])
  } catch {
    return false
  } finally {
    clearTimeout(limite)
  }
}

/**
 * Violação de índice único, restrição ou exclusão: o nome vem na mensagem do
 * Postgres. `23P01` é a restrição de exclusão que impede duas consultas no mesmo
 * horário.
 */
export function violou(erro: unknown, restricao: string): boolean {
  const e = erro as { code?: string; constraint_name?: string; constraint?: string; message?: string; cause?: unknown }
  if (e?.cause && violou(e.cause, restricao)) return true
  return (
    (e?.code === '23505' || e?.code === '23514' || e?.code === '23503' || e?.code === '23P01') &&
    (e.constraint_name === restricao || e.constraint === restricao || (e.message ?? '').includes(restricao))
  )
}
