import { createHash, randomBytes } from 'node:crypto'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import type { TipoDeChaveApi } from '@/compartilhado/vocabulario'
import type { Banco } from '@/infra/banco/conexao'
import { chavesApi, clinicas } from '@/infra/banco/esquema'
import type { ChaveGuardada, RepositorioDeAcesso, Segredos } from '../aplicacao/portas'

// O acesso sobre o Postgres e o node:crypto.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function paraChave(l: typeof chavesApi.$inferSelect): ChaveGuardada {
  return {
    id: l.id,
    clinicaId: l.clinica_id,
    nome: l.nome,
    tipo: l.tipo as TipoDeChaveApi,
    prefixo: l.prefixo,
    podeEscrever: l.pode_escrever,
    criadoEm: l.criado_em,
    ultimoUsoEm: l.ultimo_uso_em,
    revogadaEm: l.revogada_em,
  }
}

export function repositorioDeAcessoPostgres(db: Banco): RepositorioDeAcesso {
  return {
    async clinica(idOuCompanyId) {
      // O id e o companyId são uuid: outro texto nem vai ao banco, que recusaria a conversão.
      if (!UUID.test(idOuCompanyId)) return null
      const [c] = await db
        .select({ id: clinicas.id, companyId: clinicas.company_id, ativa: clinicas.ativa })
        .from(clinicas)
        .where(or(eq(clinicas.id, idOuCompanyId), eq(clinicas.company_id, idOuCompanyId)))
      return c ?? null
    },

    async chavePorHash(hash) {
      const [l] = await db.select().from(chavesApi).where(eq(chavesApi.hash, hash))
      return l ? paraChave(l) : null
    },

    async registrarUsoDaChave(chaveId, agora) {
      await db.update(chavesApi).set({ ultimo_uso_em: agora }).where(eq(chavesApi.id, chaveId))
    },

    async chavesDaClinica(clinicaId) {
      const linhas = await db.select().from(chavesApi).where(eq(chavesApi.clinica_id, clinicaId)).orderBy(asc(chavesApi.criado_em))
      return linhas.map(paraChave)
    },

    async criarChave(chave) {
      await db.insert(chavesApi).values({
        id: chave.id,
        clinica_id: chave.clinicaId,
        nome: chave.nome,
        tipo: chave.tipo,
        prefixo: chave.prefixo,
        hash: chave.hash,
        pode_escrever: chave.podeEscrever,
        criado_em: chave.criadoEm,
      })
    },

    async revogarChave(clinicaId, chaveId, agora) {
      const revogadas = await db
        .update(chavesApi)
        .set({ revogada_em: agora })
        .where(and(eq(chavesApi.clinica_id, clinicaId), eq(chavesApi.id, chaveId), isNull(chavesApi.revogada_em)))
        .returning({ id: chavesApi.id })
      return revogadas.length > 0
    },
  }
}

/** A chave tem 256 bits de acaso: o sha256 sem sal basta para achá-la sem guardar o texto. */
export const segredosNode: Segredos = {
  novaChave: () => `agd_${randomBytes(32).toString('base64url')}`,
  hashDaChave: (chave) => createHash('sha256').update(chave).digest('hex'),
}
