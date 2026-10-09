import { and, asc, desc, eq, gt, inArray, lt, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { StatusDaConsulta } from '@/compartilhado/vocabulario'
import type { Banco } from '@/infra/banco/conexao'
import { cadeiras, consultas, pacientes, procedimentos, profissionais, unidades } from '@/infra/banco/esquema'
import type { ConsultaNaAgenda, LeiturasDaAgenda } from '../aplicacao/portas'

// As leituras da agenda no formato da tela: consultas dedicadas, sem montar as
// entidades do domínio (como no CRM).

const p = alias(pacientes, 'p')

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
      const digitos = texto.replace(/\D/g, '')
      const porTelefone = digitos.length >= 4 && digitos.length >= texto.replace(/\s/g, '').length - 3
      const filtro = porTelefone
        ? sql`${pacientes.telefone} like ${'%' + digitos + '%'}`
        : sql`extensions.unaccent(lower(${pacientes.nome})) like '%' || extensions.unaccent(lower(${texto})) || '%'`
      return db
        .select({ id: pacientes.id, nome: pacientes.nome, telefone: pacientes.telefone, email: pacientes.email, nascimento: pacientes.nascimento })
        .from(pacientes)
        .where(and(eq(pacientes.clinica_id, clinicaId), filtro))
        .orderBy(asc(pacientes.nome))
        .limit(limite)
    },

    async consulta(clinicaId, consultaId) {
      const [linha] = await consultasCom(db, and(eq(consultas.clinica_id, clinicaId), eq(consultas.id, consultaId)))
      return linha ? paraConsultaNaAgenda(linha) : null
    },

    async consultasDoPaciente(clinicaId, pacienteId) {
      const linhas = await consultasCom(db, and(eq(consultas.clinica_id, clinicaId), eq(consultas.paciente_id, pacienteId))).orderBy(desc(consultas.inicio))
      return linhas.map(paraConsultaNaAgenda)
    },
  }
}
