import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, isNull, or, type SQL } from 'drizzle-orm'
import type { TipoDeChaveApi } from '@/compartilhado/vocabulario'
import type { Banco } from '@/infra/banco/conexao'
import { chavesApi, clinicas, profissionais, usuarioUnidades, usuarios } from '@/infra/banco/esquema'
import type {
  AssinadorDeTokens,
  ChaveGuardada,
  LimitadorDeTentativas,
  RepositorioDeAcesso,
  Segredos,
  UsuarioDeAcesso,
} from '../aplicacao/portas'

// O acesso sobre o Postgres e o node:crypto.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O usuário com o profissional ligado e as unidades: uma consulta para ele, outra para as unidades. */
async function usuarioOnde(db: Banco, clinicaId: string, filtro: SQL | undefined): Promise<UsuarioDeAcesso | null> {
  const [u] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      ativo: usuarios.ativo,
      gestor: usuarios.gestor,
      recepcao: usuarios.recepcao,
      dentista: usuarios.dentista,
      profissionalId: profissionais.id,
    })
    .from(usuarios)
    .leftJoin(profissionais, and(eq(profissionais.clinica_id, usuarios.clinica_id), eq(profissionais.usuario_id, usuarios.id)))
    .where(and(eq(usuarios.clinica_id, clinicaId), filtro))
  if (!u) return null
  const unidades = await db
    .select({ id: usuarioUnidades.unidade_id })
    .from(usuarioUnidades)
    .where(and(eq(usuarioUnidades.clinica_id, clinicaId), eq(usuarioUnidades.usuario_id, u.id)))
  return {
    id: u.id,
    nome: u.nome,
    ativo: u.ativo,
    papeis: { gestor: u.gestor, recepcao: u.recepcao, dentista: u.dentista },
    profissionalId: u.profissionalId,
    unidades: unidades.map((x) => x.id),
  }
}

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

    async clinicaDaSessao(id) {
      if (!UUID.test(id)) return null
      const [c] = await db
        .select({
          id: clinicas.id,
          companyId: clinicas.company_id,
          ativa: clinicas.ativa,
          nome: clinicas.nome,
          fusoHorario: clinicas.fuso_horario,
          cadenciaMinutos: clinicas.cadencia_minutos,
        })
        .from(clinicas)
        .where(and(eq(clinicas.id, id), eq(clinicas.ativa, true)))
      return c ?? null
    },

    async definirCadencia(clinicaId, minutos) {
      await db.update(clinicas).set({ cadencia_minutos: minutos }).where(eq(clinicas.id, clinicaId))
    },

    async usuarioDaPlataforma(clinicaId, usuarioPlataformaId) {
      if (!UUID.test(usuarioPlataformaId)) return null
      return usuarioOnde(db, clinicaId, eq(usuarios.usuario_plataforma_id, usuarioPlataformaId))
    },

    async usuario(clinicaId, usuarioId) {
      if (!UUID.test(usuarioId)) return null
      return usuarioOnde(db, clinicaId, eq(usuarios.id, usuarioId))
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

const hmac = (segredo: Buffer, texto: string) => createHmac('sha256', segredo).update(texto, 'utf8').digest()

/**
 * Token = base64url(JSON) + "." + base64url(HMAC-SHA256), como no CRM. Não é JWT
 * de propósito: sem cabeçalho de algoritmo, não há como trocar o algoritmo. A
 * assinatura é conferida antes de ler o conteúdo.
 */
export function assinadorHmac(segredoDaSessao: string): AssinadorDeTokens {
  if (segredoDaSessao.length < 32) throw new Error('AGENDA_SEGREDO_SESSAO precisa de pelo menos 32 caracteres')
  const segredo = Buffer.from(segredoDaSessao, 'utf8')
  return {
    assinar(dados) {
      const conteudo = Buffer.from(JSON.stringify(dados)).toString('base64url')
      return `${conteudo}.${hmac(segredo, conteudo).toString('base64url')}`
    },
    verificar(token) {
      const [conteudo, assinatura, sobra] = token.split('.')
      if (!conteudo || !assinatura || sobra !== undefined) return null
      const recebida = Buffer.from(assinatura, 'base64url')
      const esperada = hmac(segredo, conteudo)
      if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null
      try {
        const dados = JSON.parse(Buffer.from(conteudo, 'base64url').toString('utf8'))
        return typeof dados === 'object' && dados !== null ? (dados as Record<string, unknown>) : null
      } catch {
        return null
      }
    },
  }
}

/** Sem o segredo no .env: nenhum token é emitido nem aceito. */
export const assinadorIndisponivel: AssinadorDeTokens = {
  assinar() {
    throw new Error('AGENDA_SEGREDO_SESSAO ausente: a agenda não emite sessão')
  },
  verificar: () => null,
}

/**
 * Contagem na memória do processo, por janela de um minuto. Serve para um processo
 * só; com mais de uma instância, cada uma conta a sua.
 */
export function limitadorEmMemoria(porMinuto = 30): LimitadorDeTentativas {
  const tentativas = new Map<string, number[]>()
  return {
    tentar(chave, agora) {
      const lista = (tentativas.get(chave) ?? []).filter((t) => t > agora.getTime() - 60_000)
      if (tentativas.size > 10_000) tentativas.clear()
      tentativas.set(chave, lista)
      if (lista.length >= porMinuto) return false
      lista.push(agora.getTime())
      return true
    },
  }
}
