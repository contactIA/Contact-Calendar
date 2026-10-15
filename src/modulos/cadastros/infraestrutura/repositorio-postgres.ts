import { and, asc, count, eq, gt, inArray, lt, notInArray } from 'drizzle-orm'
import { ErroDeDominio } from '@/compartilhado/erros'
import type { TipoDeBloqueio } from '@/compartilhado/vocabulario'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { violou, type Banco } from '@/infra/banco/conexao'
import {
  bloqueios,
  cadeiras,
  clinicas,
  especialidades,
  expedientes,
  procedimentos,
  profissionais,
  profissionalEspecialidades,
  profissionalUnidades,
  unidades,
  usuarios,
} from '@/infra/banco/esquema'
import type { CadastrosNoBanco, Profissional, RepositorioDeCadastros } from '../aplicacao/portas'

// Os cadastros sobre o Postgres (Drizzle), presos à transação. O nome que repete
// vira o erro de domínio: o índice único sobre lower(nome) é quem decide.

const NOMES_UNICOS: Record<string, string> = {
  unidades_nome: 'Já existe uma unidade com esse nome',
  cadeiras_nome: 'Já existe uma cadeira com esse nome na unidade',
  especialidades_nome: 'Já existe uma especialidade com esse nome',
  procedimentos_nome: 'Já existe um procedimento com esse nome',
}

async function gravando<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar()
  } catch (erro) {
    for (const [restricao, frase] of Object.entries(NOMES_UNICOS)) {
      if (violou(erro, restricao)) throw new ErroDeDominio('conflito', 'NOME_REPETIDO', frase)
    }
    if (violou(erro, 'profissionais_no_prontuario')) {
      throw new ErroDeDominio('conflito', 'DENTISTA_JA_LIGADO', 'Esse dentista do prontuário já está ligado a outro profissional')
    }
    if (violou(erro, 'profissionais_usuario')) {
      throw new ErroDeDominio('conflito', 'USUARIO_JA_E_PROFISSIONAL', 'Esse usuário já está ligado a outro profissional')
    }
    if (violou(erro, 'expedientes_sem_sobreposicao')) {
      throw new ErroDeDominio('invalido', 'EXPEDIENTES_SE_CRUZAM', 'Dois horários do profissional se cruzam no mesmo dia')
    }
    throw erro
  }
}

const horaCurta = (hora: string) => hora.slice(0, 5)

function repositorio(db: Banco): RepositorioDeCadastros {
  const daClinica = (tabela: { clinica_id: AnyPgColumn; id: AnyPgColumn }, clinicaId: string, id: string) =>
    and(eq(tabela.clinica_id, clinicaId), eq(tabela.id, id))

  async function vinculos(clinicaId: string, ids: string[]) {
    if (!ids.length) return { especialidadesDe: new Map<string, string[]>(), unidadesDe: new Map<string, Profissional['unidades']>() }
    const [esp, uni] = await Promise.all([
      db
        .select()
        .from(profissionalEspecialidades)
        .where(and(eq(profissionalEspecialidades.clinica_id, clinicaId), inArray(profissionalEspecialidades.profissional_id, ids))),
      db
        .select()
        .from(profissionalUnidades)
        .where(and(eq(profissionalUnidades.clinica_id, clinicaId), inArray(profissionalUnidades.profissional_id, ids)))
        .orderBy(asc(profissionalUnidades.prioridade)),
    ])
    const especialidadesDe = new Map<string, string[]>()
    for (const e of esp) especialidadesDe.set(e.profissional_id, [...(especialidadesDe.get(e.profissional_id) ?? []), e.especialidade_id])
    const unidadesDe = new Map<string, Profissional['unidades']>()
    for (const u of uni) unidadesDe.set(u.profissional_id, [...(unidadesDe.get(u.profissional_id) ?? []), { unidadeId: u.unidade_id, prioridade: u.prioridade }])
    return { especialidadesDe, unidadesDe }
  }

  async function profissionaisCom(clinicaId: string, id?: string): Promise<Profissional[]> {
    const linhas = await db
      .select()
      .from(profissionais)
      .where(id ? daClinica(profissionais, clinicaId, id) : eq(profissionais.clinica_id, clinicaId))
      .orderBy(asc(profissionais.nome))
    const { especialidadesDe, unidadesDe } = await vinculos(
      clinicaId,
      linhas.map((l) => l.id)
    )
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      cro: l.cro,
      cor: l.cor,
      usuarioId: l.usuario_id,
      idNoProntuario: l.id_no_prontuario,
      ativo: l.ativo,
      especialidadeIds: especialidadesDe.get(l.id) ?? [],
      unidades: unidadesDe.get(l.id) ?? [],
    }))
  }

  /** Grava as especialidades e as unidades do profissional como vieram. */
  async function gravarVinculos(clinicaId: string, p: Profissional) {
    await db.delete(profissionalEspecialidades).where(eq(profissionalEspecialidades.profissional_id, p.id))
    if (p.especialidadeIds.length) {
      await db
        .insert(profissionalEspecialidades)
        .values(p.especialidadeIds.map((especialidade_id) => ({ clinica_id: clinicaId, profissional_id: p.id, especialidade_id })))
    }
    // Sair da unidade apaga os expedientes dele lá (on delete cascade); ficar só muda a prioridade.
    const ficam = p.unidades.map((u) => u.unidadeId)
    await db
      .delete(profissionalUnidades)
      .where(
        and(
          eq(profissionalUnidades.profissional_id, p.id),
          ficam.length ? notInArray(profissionalUnidades.unidade_id, ficam) : undefined
        )
      )
    for (const u of p.unidades) {
      await db
        .insert(profissionalUnidades)
        .values({ clinica_id: clinicaId, profissional_id: p.id, unidade_id: u.unidadeId, prioridade: u.prioridade })
        .onConflictDoUpdate({ target: [profissionalUnidades.profissional_id, profissionalUnidades.unidade_id], set: { prioridade: u.prioridade } })
    }
  }

  return {
    unidades: {
      async listar(clinicaId) {
        const linhas = await db.select().from(unidades).where(eq(unidades.clinica_id, clinicaId)).orderBy(asc(unidades.nome))
        return linhas.map((u) => ({ id: u.id, nome: u.nome, endereco: u.endereco, telefone: u.telefone, ativa: u.ativa, crmUnidadeId: u.crm_unidade_id }))
      },
      async obter(clinicaId, id) {
        const [u] = await db.select().from(unidades).where(daClinica(unidades, clinicaId, id))
        return u ? { id: u.id, nome: u.nome, endereco: u.endereco, telefone: u.telefone, ativa: u.ativa, crmUnidadeId: u.crm_unidade_id } : null
      },
      async inserir(clinicaId, u) {
        await gravando(() =>
          db.insert(unidades).values({ id: u.id, clinica_id: clinicaId, nome: u.nome, endereco: u.endereco, telefone: u.telefone, ativa: u.ativa, crm_unidade_id: u.crmUnidadeId })
        )
      },
      async atualizar(clinicaId, u) {
        await gravando(() =>
          db
            .update(unidades)
            .set({ nome: u.nome, endereco: u.endereco, telefone: u.telefone, ativa: u.ativa, crm_unidade_id: u.crmUnidadeId })
            .where(daClinica(unidades, clinicaId, u.id))
        )
      },
    },

    cadeiras: {
      async listar(clinicaId, unidadeId) {
        return db
          .select({ id: cadeiras.id, unidadeId: cadeiras.unidade_id, nome: cadeiras.nome, ativa: cadeiras.ativa })
          .from(cadeiras)
          .where(and(eq(cadeiras.clinica_id, clinicaId), unidadeId ? eq(cadeiras.unidade_id, unidadeId) : undefined))
          .orderBy(asc(cadeiras.nome))
      },
      async obter(clinicaId, id) {
        const [c] = await db
          .select({ id: cadeiras.id, unidadeId: cadeiras.unidade_id, nome: cadeiras.nome, ativa: cadeiras.ativa })
          .from(cadeiras)
          .where(daClinica(cadeiras, clinicaId, id))
        return c ?? null
      },
      async inserir(clinicaId, c) {
        await gravando(() => db.insert(cadeiras).values({ id: c.id, clinica_id: clinicaId, unidade_id: c.unidadeId, nome: c.nome, ativa: c.ativa }))
      },
      async atualizar(clinicaId, c) {
        await gravando(() => db.update(cadeiras).set({ nome: c.nome, ativa: c.ativa }).where(daClinica(cadeiras, clinicaId, c.id)))
      },
    },

    especialidades: {
      async listar(clinicaId) {
        return db
          .select({ id: especialidades.id, nome: especialidades.nome })
          .from(especialidades)
          .where(eq(especialidades.clinica_id, clinicaId))
          .orderBy(asc(especialidades.nome))
      },
      async obter(clinicaId, id) {
        const [e] = await db.select({ id: especialidades.id, nome: especialidades.nome }).from(especialidades).where(daClinica(especialidades, clinicaId, id))
        return e ?? null
      },
      async inserir(clinicaId, e) {
        await gravando(() => db.insert(especialidades).values({ id: e.id, clinica_id: clinicaId, nome: e.nome }))
      },
      async atualizar(clinicaId, e) {
        await gravando(() => db.update(especialidades).set({ nome: e.nome }).where(daClinica(especialidades, clinicaId, e.id)))
      },
      async usos(clinicaId, id) {
        const [[nosProcedimentos], [nosProfissionais]] = await Promise.all([
          db.select({ n: count() }).from(procedimentos).where(and(eq(procedimentos.clinica_id, clinicaId), eq(procedimentos.especialidade_id, id))),
          db
            .select({ n: count() })
            .from(profissionalEspecialidades)
            .where(and(eq(profissionalEspecialidades.clinica_id, clinicaId), eq(profissionalEspecialidades.especialidade_id, id))),
        ])
        return (nosProcedimentos?.n ?? 0) + (nosProfissionais?.n ?? 0)
      },
      async apagar(clinicaId, id) {
        await db.delete(especialidades).where(daClinica(especialidades, clinicaId, id))
      },
    },

    procedimentos: {
      async listar(clinicaId) {
        const linhas = await db.select().from(procedimentos).where(eq(procedimentos.clinica_id, clinicaId)).orderBy(asc(procedimentos.nome))
        return linhas.map((p) => ({ id: p.id, nome: p.nome, duracaoMinutos: p.duracao_minutos, cor: p.cor, especialidadeId: p.especialidade_id, ativo: p.ativo }))
      },
      async obter(clinicaId, id) {
        const [p] = await db.select().from(procedimentos).where(daClinica(procedimentos, clinicaId, id))
        return p ? { id: p.id, nome: p.nome, duracaoMinutos: p.duracao_minutos, cor: p.cor, especialidadeId: p.especialidade_id, ativo: p.ativo } : null
      },
      async inserir(clinicaId, p) {
        await gravando(() =>
          db.insert(procedimentos).values({
            id: p.id,
            clinica_id: clinicaId,
            nome: p.nome,
            duracao_minutos: p.duracaoMinutos,
            cor: p.cor,
            especialidade_id: p.especialidadeId,
            ativo: p.ativo,
          })
        )
      },
      async atualizar(clinicaId, p) {
        await gravando(() =>
          db
            .update(procedimentos)
            .set({ nome: p.nome, duracao_minutos: p.duracaoMinutos, cor: p.cor, especialidade_id: p.especialidadeId, ativo: p.ativo })
            .where(daClinica(procedimentos, clinicaId, p.id))
        )
      },
    },

    profissionais: {
      listar: (clinicaId) => profissionaisCom(clinicaId),
      async obter(clinicaId, id) {
        return (await profissionaisCom(clinicaId, id))[0] ?? null
      },
      async inserir(clinicaId, p) {
        await gravando(async () => {
          await db.insert(profissionais).values({ id: p.id, clinica_id: clinicaId, nome: p.nome, cro: p.cro, cor: p.cor, usuario_id: p.usuarioId, id_no_prontuario: p.idNoProntuario, ativo: p.ativo })
          await gravarVinculos(clinicaId, p)
        })
      },
      async atualizar(clinicaId, p) {
        await gravando(async () => {
          await db
            .update(profissionais)
            .set({ nome: p.nome, cro: p.cro, cor: p.cor, usuario_id: p.usuarioId, id_no_prontuario: p.idNoProntuario, ativo: p.ativo })
            .where(daClinica(profissionais, clinicaId, p.id))
          await gravarVinculos(clinicaId, p)
        })
      },
      async usuarioExiste(clinicaId, usuarioId) {
        const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(daClinica(usuarios, clinicaId, usuarioId))
        return Boolean(u)
      },
    },

    clinica: {
      async definirProcedimentoDasVindas(clinicaId, procedimentoId) {
        await db.update(clinicas).set({ procedimento_das_vindas_id: procedimentoId }).where(eq(clinicas.id, clinicaId))
      },
    },

    expedientes: {
      async doProfissional(clinicaId, profissionalId) {
        const linhas = await db
          .select()
          .from(expedientes)
          .where(and(eq(expedientes.clinica_id, clinicaId), eq(expedientes.profissional_id, profissionalId)))
          .orderBy(asc(expedientes.dia_semana), asc(expedientes.inicio))
        return linhas.map((e) => ({ id: e.id, unidadeId: e.unidade_id, diaSemana: e.dia_semana, inicio: horaCurta(e.inicio), fim: horaCurta(e.fim) }))
      },
      async substituir(clinicaId, profissionalId, novos) {
        await db.delete(expedientes).where(and(eq(expedientes.clinica_id, clinicaId), eq(expedientes.profissional_id, profissionalId)))
        if (!novos.length) return
        await gravando(() =>
          db.insert(expedientes).values(
            novos.map((e) => ({
              id: e.id,
              clinica_id: clinicaId,
              profissional_id: profissionalId,
              unidade_id: e.unidadeId,
              dia_semana: e.diaSemana,
              inicio: e.inicio,
              fim: e.fim,
            }))
          )
        )
      },
    },

    bloqueios: {
      async listar(clinicaId, filtro) {
        const linhas = await db
          .select()
          .from(bloqueios)
          .where(
            and(
              eq(bloqueios.clinica_id, clinicaId),
              lt(bloqueios.inicio, filtro.ate),
              gt(bloqueios.fim, filtro.de),
              filtro.profissionalId ? eq(bloqueios.profissional_id, filtro.profissionalId) : undefined
            )
          )
          .orderBy(asc(bloqueios.inicio))
        return linhas.map(paraBloqueio)
      },
      async obter(clinicaId, id) {
        const [b] = await db.select().from(bloqueios).where(daClinica(bloqueios, clinicaId, id))
        return b ? paraBloqueio(b) : null
      },
      async inserir(clinicaId, b) {
        await db.insert(bloqueios).values({
          id: b.id,
          clinica_id: clinicaId,
          profissional_id: b.profissionalId,
          unidade_id: b.unidadeId,
          inicio: b.inicio,
          fim: b.fim,
          tipo: b.tipo,
          motivo: b.motivo,
          criado_por_id: b.criadoPorId,
        })
      },
      async apagar(clinicaId, id) {
        await db.delete(bloqueios).where(daClinica(bloqueios, clinicaId, id))
      },
    },
  }
}

function paraBloqueio(b: typeof bloqueios.$inferSelect) {
  return {
    id: b.id,
    profissionalId: b.profissional_id,
    unidadeId: b.unidade_id,
    inicio: b.inicio,
    fim: b.fim,
    tipo: b.tipo as TipoDeBloqueio,
    motivo: b.motivo,
    criadoPorId: b.criado_por_id,
  }
}

export function cadastrosNoPostgres(banco: Banco): CadastrosNoBanco {
  return {
    executar: (trabalho) => banco.transaction((tx) => trabalho(repositorio(tx as unknown as Banco))),
  }
}
