import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { StatusDaConsulta } from '@/compartilhado/vocabulario'
import type { Banco } from '@/infra/banco/conexao'
import { cadeiras, consultas, pacientes, procedimentos, profissionais, unidades, vindasDoCrm } from '@/infra/banco/esquema'
import type { ConsultaNaAgenda, LeiturasDaAgenda, VindaNaLista } from '../aplicacao/portas'

// As leituras da agenda no formato da tela: consultas dedicadas, sem montar as
// entidades do domínio (como no CRM).

const p = alias(pacientes, 'p')

/** Pelo nome sem acento, ou pelos dígitos do telefone quando o texto é quase só número. */
function filtroDaBusca(texto: string): SQL {
  const digitos = texto.replace(/\D/g, '')
  const porTelefone = digitos.length >= 4 && digitos.length >= texto.replace(/\s/g, '').length - 3
  return porTelefone
    ? sql`${pacientes.telefone} like ${'%' + digitos + '%'}`
    : sql`extensions.unaccent(lower(${pacientes.nome})) like '%' || extensions.unaccent(lower(${texto})) || '%'`
}

const CAMPOS_DA_CONSULTA = {
  id: consultas.id,
  inicio: consultas.inicio,
  fim: consultas.fim,
  status: consultas.status,
  observacoes: consultas.observacoes,
  versao: consultas.versao,
  unidadeId: unidades.id,
  unidadeNome: unidades.nome,
  cadeiraId: cadeiras.id,
  cadeiraNome: cadeiras.nome,
  profissionalId: profissionais.id,
  profissionalNome: profissionais.nome,
  profissionalCor: profissionais.cor,
  pacienteId: p.id,
  pacienteNome: p.nome,
  pacienteTelefone: p.telefone,
  procedimentoId: procedimentos.id,
  procedimentoNome: procedimentos.nome,
  procedimentoCor: procedimentos.cor,
}

type LinhaDaConsulta = Awaited<ReturnType<typeof consultasCom>>[number]

function paraConsultaNaAgenda(l: LinhaDaConsulta): ConsultaNaAgenda {
  return {
    id: l.id,
    inicio: l.inicio,
    fim: l.fim,
    status: l.status as StatusDaConsulta,
    observacoes: l.observacoes,
    versao: l.versao,
    unidade: { id: l.unidadeId, nome: l.unidadeNome },
    cadeira: { id: l.cadeiraId, nome: l.cadeiraNome },
    profissional: { id: l.profissionalId, nome: l.profissionalNome, cor: l.profissionalCor },
    paciente: { id: l.pacienteId, nome: l.pacienteNome, telefone: l.pacienteTelefone },
    procedimento: { id: l.procedimentoId, nome: l.procedimentoNome, cor: l.procedimentoCor },
  }
}

function consultasCom(db: Banco, filtro: SQL | undefined) {
  return db
    .select(CAMPOS_DA_CONSULTA)
    .from(consultas)
    .innerJoin(unidades, eq(unidades.id, consultas.unidade_id))
    .innerJoin(cadeiras, eq(cadeiras.id, consultas.cadeira_id))
    .innerJoin(profissionais, eq(profissionais.id, consultas.profissional_id))
    .innerJoin(p, eq(p.id, consultas.paciente_id))
    .innerJoin(procedimentos, eq(procedimentos.id, consultas.procedimento_id))
    .where(filtro)
}

export function leiturasDaAgendaPostgres(db: Banco): LeiturasDaAgenda {
  return {
    async agendaDoPeriodo(clinicaId, filtro) {
      const linhas = await consultasCom(
        db,
        and(
          eq(consultas.clinica_id, clinicaId),
          lt(consultas.inicio, filtro.ate),
          gt(consultas.fim, filtro.de),
          filtro.unidadeIds ? inArray(consultas.unidade_id, filtro.unidadeIds.length ? filtro.unidadeIds : ['00000000-0000-0000-0000-000000000000']) : undefined,
          filtro.profissionalId ? eq(consultas.profissional_id, filtro.profissionalId) : undefined
        )
      ).orderBy(asc(consultas.inicio), asc(profissionais.nome))
      return linhas.map(paraConsultaNaAgenda)
    },

    async buscarPacientes(clinicaId, texto, limite) {
      return db
        .select({ id: pacientes.id, nome: pacientes.nome, telefone: pacientes.telefone, email: pacientes.email, nascimento: pacientes.nascimento })
        .from(pacientes)
        .where(and(eq(pacientes.clinica_id, clinicaId), filtroDaBusca(texto)))
        .orderBy(asc(pacientes.nome))
        .limit(limite)
    },

    async listarPacientes(clinicaId, { busca, limite, deslocamento }) {
      const onde = and(eq(pacientes.clinica_id, clinicaId), busca ? filtroDaBusca(busca) : undefined)
      const [linhas, [contagem]] = await Promise.all([
        db
          .select({
            id: pacientes.id,
            nome: pacientes.nome,
            telefone: pacientes.telefone,
            email: pacientes.email,
            nascimento: pacientes.nascimento,
            observacoes: pacientes.observacoes,
            criadoEm: pacientes.criado_em,
          })
          .from(pacientes)
          .where(onde)
          .orderBy(asc(pacientes.nome), asc(pacientes.id))
          .limit(limite)
          .offset(deslocamento),
        db.select({ total: sql<number>`count(*)::int`.mapWith(Number) }).from(pacientes).where(onde),
      ])
      return { pacientes: linhas, total: contagem?.total ?? 0 }
    },

    async consulta(clinicaId, consultaId) {
      const [linha] = await consultasCom(db, and(eq(consultas.clinica_id, clinicaId), eq(consultas.id, consultaId)))
      return linha ? paraConsultaNaAgenda(linha) : null
    },

    async consultasDoPaciente(clinicaId, pacienteId) {
      const linhas = await consultasCom(db, and(eq(consultas.clinica_id, clinicaId), eq(consultas.paciente_id, pacienteId))).orderBy(desc(consultas.inicio))
      return linhas.map(paraConsultaNaAgenda)
    },

    async vindasPendentes(clinicaId, unidadeIds) {
      // A vinda sem unidade aparece para todos: ninguém mais saberia dela.
      const daUnidade = unidadeIds === null ? undefined : unidadeIds.length ? or(isNull(vindasDoCrm.unidade_id), inArray(vindasDoCrm.unidade_id, unidadeIds)) : isNull(vindasDoCrm.unidade_id)
      const linhas = await db
        .select({
          vinda: vindasDoCrm,
          unidadeNome: unidades.nome,
          consultaInicio: consultas.inicio,
          profissionalId: profissionais.id,
          profissionalNome: profissionais.nome,
        })
        .from(vindasDoCrm)
        .leftJoin(unidades, and(eq(unidades.clinica_id, vindasDoCrm.clinica_id), eq(unidades.id, vindasDoCrm.unidade_id)))
        .leftJoin(consultas, and(eq(consultas.clinica_id, vindasDoCrm.clinica_id), eq(consultas.id, vindasDoCrm.consulta_id)))
        .leftJoin(profissionais, and(eq(profissionais.clinica_id, consultas.clinica_id), eq(profissionais.id, consultas.profissional_id)))
        .where(and(eq(vindasDoCrm.clinica_id, clinicaId), eq(vindasDoCrm.situacao, 'pendente'), daUnidade))
        .orderBy(asc(vindasDoCrm.inicio))
      return linhas.map(({ vinda: v, unidadeNome, consultaInicio, profissionalId, profissionalNome }): VindaNaLista => ({
        id: v.id,
        tipo: v.tipo as VindaNaLista['tipo'],
        motivo: v.motivo,
        crmCardId: v.crm_card_id,
        unidade: v.unidade_id && unidadeNome ? { id: v.unidade_id, nome: unidadeNome } : null,
        nome: v.nome,
        telefone: v.telefone,
        inicio: v.inicio,
        fim: v.fim,
        profissionalNoProntuario: v.profissional_no_prontuario_id ? { id: v.profissional_no_prontuario_id, nome: v.profissional_no_prontuario_nome } : null,
        consultaAtual:
          v.consulta_id && consultaInicio && profissionalId && profissionalNome
            ? { id: v.consulta_id, inicio: consultaInicio, profissional: { id: profissionalId, nome: profissionalNome } }
            : null,
        criadoEm: v.criado_em,
      }))
    },
  }
}
