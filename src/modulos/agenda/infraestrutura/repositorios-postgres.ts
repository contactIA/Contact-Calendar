import { and, asc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import { ErroDeDominio } from '@/compartilhado/erros'
import { STATUS_QUE_OCUPAM_HORARIO, type StatusDaConsulta, type TipoDeAtor } from '@/compartilhado/vocabulario'
import { violou, type Banco } from '@/infra/banco/conexao'
import {
  bloqueios,
  cadeiras,
  caixaDeSaida,
  clinicas,
  consultas,
  eventos,
  expedientes,
  pacientes,
  procedimentos,
  profissionais,
  profissionalEspecialidades,
  profissionalUnidades,
  unidades,
} from '@/infra/banco/esquema'
import type { Repositorios, UnidadeDeTrabalho, Ocupacao } from '../aplicacao/portas'
import type { Consulta } from '../dominio/consulta'
import type { Janela } from '../dominio/disponibilidade'
import type { Paciente } from '../dominio/paciente'

// Os repositórios da agenda sobre o Postgres (Drizzle), todos presos à transação
// da unidade de trabalho. As restrições de exclusão do banco viram o erro de
// domínio delas: é o que responde ao pedido que chegou ao mesmo tempo que outro.

const OCUPAM = [...STATUS_QUE_OCUPAM_HORARIO]

const cruzaComOPeriodo = (inicio: typeof consultas.inicio, fim: typeof consultas.fim, periodo: Janela) =>
  and(lt(inicio, periodo.fim), gt(fim, periodo.inicio))

function traduzirViolacao(erro: unknown): never {
  if (violou(erro, 'consultas_profissional_sem_sobreposicao')) {
    throw new ErroDeDominio('conflito', 'HORARIO_DO_PROFISSIONAL_OCUPADO', 'O profissional acabou de ganhar outra consulta nesse horário')
  }
  if (violou(erro, 'consultas_cadeira_sem_sobreposicao')) {
    throw new ErroDeDominio('conflito', 'CADEIRA_OCUPADA', 'A cadeira acabou de ser ocupada nesse horário')
  }
  if (violou(erro, 'consultas_paciente_sem_sobreposicao')) {
    throw new ErroDeDominio('conflito', 'PACIENTE_JA_TEM_CONSULTA', 'O paciente acabou de ganhar outra consulta nesse horário')
  }
  throw erro
}

function paraConsulta(l: typeof consultas.$inferSelect): Consulta {
  return {
    id: l.id,
    clinicaId: l.clinica_id,
    unidadeId: l.unidade_id,
    cadeiraId: l.cadeira_id,
    profissionalId: l.profissional_id,
    pacienteId: l.paciente_id,
    procedimentoId: l.procedimento_id,
    inicio: l.inicio,
    fim: l.fim,
    status: l.status as StatusDaConsulta,
    observacoes: l.observacoes,
    criadaPorTipo: l.criada_por_tipo as TipoDeAtor,
    criadaPorId: l.criada_por_id,
    canceladaEm: l.cancelada_em,
    motivoCancelamento: l.motivo_cancelamento,
    crmCardId: l.crm_card_id,
    lembreteMensagemId: l.lembrete_mensagem_id,
    versao: l.versao,
  }
}

function paraPaciente(l: typeof pacientes.$inferSelect): Paciente {
  return {
    id: l.id,
    clinicaId: l.clinica_id,
    nome: l.nome,
    telefone: l.telefone,
    email: l.email,
    nascimento: l.nascimento,
    observacoes: l.observacoes,
    contatoPlataformaId: l.contato_plataforma_id,
  }
}

/** "08:00:00" → "08:00". */
const horaCurta = (hora: string) => hora.slice(0, 5)

function agrupar<T>(linhas: T[], chave: (l: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const l of linhas) mapa.set(chave(l), [...(mapa.get(chave(l)) ?? []), l])
  return mapa
}

export function repositoriosPostgres(db: Banco): Repositorios {
  return {
    clinicas: {
      async obter(clinicaId) {
        const [c] = await db.select().from(clinicas).where(eq(clinicas.id, clinicaId))
        if (!c) return null
        return {
          id: c.id,
          fusoHorario: c.fuso_horario,
          cadenciaMinutos: c.cadencia_minutos,
          ligadaAoCrm: c.ligada_ao_crm,
          confirmacaoModeloId: c.confirmacao_modelo_id,
          lembreteModeloId: c.lembrete_modelo_id,
          lembreteAntecedenciaHoras: c.lembrete_antecedencia_horas,
          sincronizarContatos: c.sincronizar_contatos,
          etiquetas: { agendou: c.etiqueta_agendou_id, compareceu: c.etiqueta_compareceu_id, faltou: c.etiqueta_faltou_id },
        }
      },
    },

    estrutura: {
      async unidade(clinicaId, unidadeId) {
        const [u] = await db.select().from(unidades).where(and(eq(unidades.clinica_id, clinicaId), eq(unidades.id, unidadeId)))
        return u ? { id: u.id, nome: u.nome, ativa: u.ativa, crmUnidadeId: u.crm_unidade_id } : null
      },

      async procedimento(clinicaId, procedimentoId) {
        const [p] = await db.select().from(procedimentos).where(and(eq(procedimentos.clinica_id, clinicaId), eq(procedimentos.id, procedimentoId)))
        return p ? { id: p.id, nome: p.nome, duracaoMinutos: p.duracao_minutos, especialidadeId: p.especialidade_id, ativo: p.ativo } : null
      },

      async profissionaisDaUnidade(clinicaId, unidadeId) {
        const linhas = await db
          .select({ id: profissionais.id, nome: profissionais.nome, ativo: profissionais.ativo, prioridade: profissionalUnidades.prioridade })
          .from(profissionalUnidades)
          .innerJoin(profissionais, eq(profissionais.id, profissionalUnidades.profissional_id))
          .where(and(eq(profissionalUnidades.clinica_id, clinicaId), eq(profissionalUnidades.unidade_id, unidadeId)))
          .orderBy(asc(profissionais.nome))
        if (!linhas.length) return []
        const especialidades = await db
          .select()
          .from(profissionalEspecialidades)
          .where(inArray(profissionalEspecialidades.profissional_id, linhas.map((l) => l.id)))
        const porProfissional = agrupar(especialidades, (e) => e.profissional_id)
        return linhas.map((l) => ({ ...l, especialidadeIds: (porProfissional.get(l.id) ?? []).map((e) => e.especialidade_id) }))
      },

      async cadeirasAtivas(clinicaId, unidadeId) {
        return db
          .select({ id: cadeiras.id, nome: cadeiras.nome })
          .from(cadeiras)
          .where(and(eq(cadeiras.clinica_id, clinicaId), eq(cadeiras.unidade_id, unidadeId), eq(cadeiras.ativa, true)))
          .orderBy(asc(cadeiras.nome))
      },

      async expedientes(clinicaId, unidadeId, diaSemana, profissionalIds) {
        if (!profissionalIds.length) return []
        const linhas = await db
          .select()
          .from(expedientes)
          .where(
            and(
              eq(expedientes.clinica_id, clinicaId),
              eq(expedientes.unidade_id, unidadeId),
              eq(expedientes.dia_semana, diaSemana),
              inArray(expedientes.profissional_id, profissionalIds)
            )
          )
          .orderBy(asc(expedientes.inicio))
        return linhas.map((l) => ({ profissionalId: l.profissional_id, inicio: horaCurta(l.inicio), fim: horaCurta(l.fim) }))
      },
    },

    ocupacoes: {
      async dosProfissionais(clinicaId, profissionalIds, periodo, excetoConsultaId) {
        const mapa = new Map<string, Ocupacao[]>()
        if (!profissionalIds.length) return mapa
        const [ocupadas, bloqueadas] = await Promise.all([
          db
            .select({ dono: consultas.profissional_id, inicio: consultas.inicio, fim: consultas.fim })
            .from(consultas)
            .where(
              and(
                eq(consultas.clinica_id, clinicaId),
                inArray(consultas.profissional_id, profissionalIds),
                inArray(consultas.status, OCUPAM),
                cruzaComOPeriodo(consultas.inicio, consultas.fim, periodo),
                excetoConsultaId ? ne(consultas.id, excetoConsultaId) : undefined
              )
            ),
          db
            .select({ dono: bloqueios.profissional_id, inicio: bloqueios.inicio, fim: bloqueios.fim })
            .from(bloqueios)
            .where(
              and(
                eq(bloqueios.clinica_id, clinicaId),
                inArray(bloqueios.profissional_id, profissionalIds),
                lt(bloqueios.inicio, periodo.fim),
                gt(bloqueios.fim, periodo.inicio)
              )
            ),
        ])
        for (const o of ocupadas) mapa.set(o.dono, [...(mapa.get(o.dono) ?? []), { tipo: 'consulta', inicio: o.inicio, fim: o.fim }])
        for (const b of bloqueadas) mapa.set(b.dono, [...(mapa.get(b.dono) ?? []), { tipo: 'bloqueio', inicio: b.inicio, fim: b.fim }])
        return mapa
      },

      async dasCadeiras(clinicaId, cadeiraIds, periodo, excetoConsultaId) {
        const mapa = new Map<string, Janela[]>()
        if (!cadeiraIds.length) return mapa
        const ocupadas = await db
          .select({ dono: consultas.cadeira_id, inicio: consultas.inicio, fim: consultas.fim })
          .from(consultas)
          .where(
            and(
              eq(consultas.clinica_id, clinicaId),
              inArray(consultas.cadeira_id, cadeiraIds),
              inArray(consultas.status, OCUPAM),
              cruzaComOPeriodo(consultas.inicio, consultas.fim, periodo),
              excetoConsultaId ? ne(consultas.id, excetoConsultaId) : undefined
            )
          )
        for (const o of ocupadas) mapa.set(o.dono, [...(mapa.get(o.dono) ?? []), { inicio: o.inicio, fim: o.fim }])
        return mapa
      },

      async doPaciente(clinicaId, pacienteId, periodo, excetoConsultaId) {
        return db
          .select({ inicio: consultas.inicio, fim: consultas.fim })
          .from(consultas)
          .where(
            and(
              eq(consultas.clinica_id, clinicaId),
              eq(consultas.paciente_id, pacienteId),
              inArray(consultas.status, OCUPAM),
              cruzaComOPeriodo(consultas.inicio, consultas.fim, periodo),
              excetoConsultaId ? ne(consultas.id, excetoConsultaId) : undefined
            )
          )
      },
    },

    consultas: {
      async obter(clinicaId, consultaId, opcoes) {
        const consulta = db.select().from(consultas).where(and(eq(consultas.clinica_id, clinicaId), eq(consultas.id, consultaId)))
        const [l] = opcoes?.travar ? await consulta.for('update') : await consulta
        return l ? paraConsulta(l) : null
      },

      async inserir(c) {
        try {
          await db.insert(consultas).values({
            id: c.id,
            clinica_id: c.clinicaId,
            unidade_id: c.unidadeId,
            cadeira_id: c.cadeiraId,
            profissional_id: c.profissionalId,
            paciente_id: c.pacienteId,
            procedimento_id: c.procedimentoId,
            inicio: c.inicio,
            fim: c.fim,
            status: c.status,
            observacoes: c.observacoes,
            criada_por_tipo: c.criadaPorTipo,
            criada_por_id: c.criadaPorId,
            cancelada_em: c.canceladaEm,
            motivo_cancelamento: c.motivoCancelamento,
            crm_card_id: c.crmCardId,
            lembrete_mensagem_id: c.lembreteMensagemId,
            versao: c.versao,
          })
        } catch (erro) {
          traduzirViolacao(erro)
        }
      },

      async atualizar(c) {
        let linhas
        try {
          linhas = await db
            .update(consultas)
            .set({
              cadeira_id: c.cadeiraId,
              profissional_id: c.profissionalId,
              inicio: c.inicio,
              fim: c.fim,
              status: c.status,
              observacoes: c.observacoes,
              cancelada_em: c.canceladaEm,
              motivo_cancelamento: c.motivoCancelamento,
              crm_card_id: c.crmCardId,
              lembrete_mensagem_id: c.lembreteMensagemId,
              versao: sql`${consultas.versao} + 1`,
            })
            .where(and(eq(consultas.clinica_id, c.clinicaId), eq(consultas.id, c.id), eq(consultas.versao, c.versao)))
            .returning()
        } catch (erro) {
          traduzirViolacao(erro)
        }
        if (!linhas[0]) {
          throw new ErroDeDominio('conflito', 'CONSULTA_ALTERADA', 'A consulta mudou desde que foi lida: carregue de novo e confira')
        }
        return paraConsulta(linhas[0])
      },

      async proximaDosPacientes(clinicaId, pacienteIds, agora) {
        if (!pacienteIds.length) return null
        const [l] = await db
          .select()
          .from(consultas)
          .where(
            and(
              eq(consultas.clinica_id, clinicaId),
              inArray(consultas.paciente_id, pacienteIds),
              inArray(consultas.status, ['agendada', 'confirmada']),
              gt(consultas.inicio, agora)
            )
          )
          .orderBy(asc(consultas.inicio))
          .limit(1)
        return l ? paraConsulta(l) : null
      },

      async profissionaisQueAtenderam(clinicaId, pacienteIds) {
        if (!pacienteIds.length) return []
        const linhas = await db
          .selectDistinct({ id: consultas.profissional_id })
          .from(consultas)
          .where(
            and(eq(consultas.clinica_id, clinicaId), inArray(consultas.paciente_id, pacienteIds), inArray(consultas.status, ['em_atendimento', 'concluida']))
          )
        return linhas.map((l) => l.id)
      },
    },

    pacientes: {
      async obter(clinicaId, pacienteId) {
        const [l] = await db.select().from(pacientes).where(and(eq(pacientes.clinica_id, clinicaId), eq(pacientes.id, pacienteId)))
        return l ? paraPaciente(l) : null
      },

      async comTelefone(clinicaId, telefone) {
        const linhas = await db
          .select()
          .from(pacientes)
          .where(and(eq(pacientes.clinica_id, clinicaId), eq(pacientes.telefone, telefone)))
          .orderBy(asc(pacientes.criado_em))
        return linhas.map(paraPaciente)
      },

      async inserir(p) {
        await db.insert(pacientes).values({
          id: p.id,
          clinica_id: p.clinicaId,
          nome: p.nome,
          telefone: p.telefone,
          email: p.email,
          nascimento: p.nascimento,
          observacoes: p.observacoes,
          contato_plataforma_id: p.contatoPlataformaId,
        })
      },

      async atualizar(p) {
        await db
          .update(pacientes)
          .set({ nome: p.nome, telefone: p.telefone, email: p.email, nascimento: p.nascimento, observacoes: p.observacoes, contato_plataforma_id: p.contatoPlataformaId })
          .where(and(eq(pacientes.clinica_id, p.clinicaId), eq(pacientes.id, p.id)))
      },
    },

    historico: {
      async registrar(novos) {
        if (!novos.length) return
        await db.insert(eventos).values(
          novos.map((e) => ({
            clinica_id: e.clinicaId,
            consulta_id: e.consultaId ?? null,
            paciente_id: e.pacienteId ?? null,
            tipo: e.tipo,
            dados: e.dados,
            ator_tipo: e.ator.tipo,
            ator_id: e.ator.id,
            ocorrido_em: e.ocorridoEm,
          }))
        )
      },
    },

    caixa: {
      async enfileirar(avisos) {
        if (!avisos.length) return
        await db.insert(caixaDeSaida).values(
          avisos.map((a) => ({
            clinica_id: a.clinicaId,
            destino: a.destino,
            tipo: a.tipo,
            consulta_id: a.consultaId ?? null,
            paciente_id: a.pacienteId ?? null,
            dados: a.dados,
          }))
        )
      },
    },
  }
}

export function unidadeDeTrabalhoPostgres(banco: Banco): UnidadeDeTrabalho {
  return {
    executar: (trabalho) => banco.transaction((tx) => trabalho(repositoriosPostgres(tx as unknown as Banco))),
  }
}
