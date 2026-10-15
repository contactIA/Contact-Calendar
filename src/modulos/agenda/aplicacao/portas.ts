import type { Ator } from '@/modulos/acesso/aplicacao/acesso'
import type { AcaoNaPlataforma, AvisoAoCrm, SituacaoDaVinda, StatusDaConsulta, TipoDeAtor, TipoDeEvento, TipoDeVinda } from '@/compartilhado/vocabulario'
import type { Consulta } from '../dominio/consulta'
import type { Janela } from '../dominio/disponibilidade'
import type { Paciente } from '../dominio/paciente'

// As fronteiras do módulo da agenda (ADR 0001): o banco, visto como repositórios
// dentro de uma unidade de trabalho, e as leituras no formato da tela. Os
// adaptadores ficam em ../infraestrutura.

export interface ClinicaDaAgenda {
  id: string
  fusoHorario: string
  cadenciaMinutos: number
  ligadaAoCrm: boolean
  confirmacaoModeloId: string | null
  lembreteModeloId: string | null
  lembreteAntecedenciaHoras: number
  sincronizarContatos: boolean
  etiquetas: { agendou: string | null; compareceu: string | null; faltou: string | null }
  /** O procedimento da consulta que o CRM marca fora da agenda (fase 7b). */
  procedimentoDasVindasId: string | null
}

/** A consulta que o CRM marcou fora da agenda e ainda não virou consulta aqui (fase 7b). */
export interface VindaDoCrm {
  id: string
  clinicaId: string
  crmCardId: string
  tipo: TipoDeVinda
  situacao: SituacaoDaVinda
  unidadeId: string | null
  nome: string | null
  telefone: string
  inicio: Date
  fim: Date | null
  profissionalNoProntuario: { id: string; nome: string | null } | null
  motivo: string | null
  consultaId: string | null
}

export interface Unidade {
  id: string
  nome: string
  ativa: boolean
  crmUnidadeId: string | null
}

export interface Procedimento {
  id: string
  nome: string
  duracaoMinutos: number
  especialidadeId: string | null
  ativo: boolean
}

/** Um profissional que atende na unidade, com a prioridade dele lá. */
export interface ProfissionalDaUnidade {
  id: string
  nome: string
  ativo: boolean
  prioridade: number
  especialidadeIds: string[]
}

export interface Cadeira {
  id: string
  nome: string
}

/** Um intervalo do expediente, em hora de parede: "08:00" a "12:00". */
export interface IntervaloDoExpediente {
  profissionalId: string
  inicio: string
  fim: string
}

export interface Ocupacao extends Janela {
  tipo: 'consulta' | 'bloqueio'
}

export interface NovoEvento {
  clinicaId: string
  consultaId?: string | null
  pacienteId?: string | null
  tipo: TipoDeEvento
  dados: Record<string, unknown>
  ator: Ator
  ocorridoEm: Date
}

export type NovoAviso = {
  clinicaId: string
  consultaId?: string | null
  pacienteId?: string | null
  dados: Record<string, unknown>
} & ({ destino: 'crm'; tipo: AvisoAoCrm } | { destino: 'plataforma'; tipo: AcaoNaPlataforma })

/** Os repositórios, todos presos à mesma transação. */
export interface Repositorios {
  clinicas: {
    obter(clinicaId: string): Promise<ClinicaDaAgenda | null>
  }
  estrutura: {
    unidade(clinicaId: string, unidadeId: string): Promise<Unidade | null>
    procedimento(clinicaId: string, procedimentoId: string): Promise<Procedimento | null>
    profissionaisDaUnidade(clinicaId: string, unidadeId: string): Promise<ProfissionalDaUnidade[]>
    /** As cadeiras ativas da unidade, em ordem de nome. */
    cadeirasAtivas(clinicaId: string, unidadeId: string): Promise<Cadeira[]>
    expedientes(clinicaId: string, unidadeId: string, diaSemana: number, profissionalIds: string[]): Promise<IntervaloDoExpediente[]>
    /** A unidade ativa ligada à unidade do CRM. */
    unidadePeloCrm(clinicaId: string, crmUnidadeId: string): Promise<Unidade | null>
    /** O profissional ativo ligado ao dentista do prontuário. */
    profissionalNoProntuario(clinicaId: string, idNoProntuario: string): Promise<{ id: string; nome: string } | null>
    /** Liga o profissional ao dentista do prontuário, se nenhum dos dois já tem par. Diz se ligou. */
    ligarAoProntuario(clinicaId: string, profissionalId: string, idNoProntuario: string): Promise<boolean>
  }
  ocupacoes: {
    /** As consultas que ocupam o horário, em qualquer unidade, e os bloqueios de cada profissional no período. */
    dosProfissionais(clinicaId: string, profissionalIds: string[], periodo: Janela, excetoConsultaId?: string): Promise<Map<string, Ocupacao[]>>
    dasCadeiras(clinicaId: string, cadeiraIds: string[], periodo: Janela, excetoConsultaId?: string): Promise<Map<string, Janela[]>>
    doPaciente(clinicaId: string, pacienteId: string, periodo: Janela, excetoConsultaId?: string): Promise<Janela[]>
  }
  consultas: {
    /** Com `travar`, segura a linha até o fim da transação (select ... for update). */
    obter(clinicaId: string, consultaId: string, opcoes?: { travar?: boolean }): Promise<Consulta | null>
    /** Horário ocupado por um pedido simultâneo vira o ErroDeDominio da restrição. */
    inserir(consulta: Consulta): Promise<void>
    /** Grava e sobe a versão. Recusa se outra transação mudou a consulta antes. */
    atualizar(consulta: Consulta): Promise<Consulta>
    /** A próxima consulta marcada (agendada ou confirmada) dos pacientes, depois de agora. */
    proximaDosPacientes(clinicaId: string, pacienteIds: string[], agora: Date): Promise<Consulta | null>
    /** Quem já atendeu os pacientes (consulta em atendimento ou concluída). */
    profissionaisQueAtenderam(clinicaId: string, pacienteIds: string[]): Promise<string[]>
    /** A consulta ligada ao card do CRM, nos status pedidos: a mais recente. */
    ligadaAoCard(clinicaId: string, crmCardId: string, status: readonly StatusDaConsulta[]): Promise<Consulta | null>
  }
  vindas: {
    /** A vinda pendente do card, travada até o fim da transação. */
    pendenteDoCard(clinicaId: string, crmCardId: string): Promise<VindaDoCrm | null>
    obter(clinicaId: string, vindaId: string, opcoes?: { travar?: boolean }): Promise<VindaDoCrm | null>
    /** Grava a vinda nova ou muda a que já existe (pelo id). */
    salvar(vinda: VindaDoCrm): Promise<void>
    /** Fecha a vinda: encaixada (com a consulta) ou descartada. */
    resolver(
      clinicaId: string,
      vindaId: string,
      resolucao: { situacao: 'encaixada' | 'descartada'; consultaId?: string | null; motivo?: string | null; ator: { tipo: TipoDeAtor; id: string | null }; agora: Date }
    ): Promise<void>
  }
  pacientes: {
    obter(clinicaId: string, pacienteId: string): Promise<Paciente | null>
    comTelefone(clinicaId: string, telefone: string): Promise<Paciente[]>
    inserir(paciente: Paciente): Promise<void>
    atualizar(paciente: Paciente): Promise<void>
  }
  historico: {
    registrar(eventos: NovoEvento[]): Promise<void>
  }
  caixa: {
    /** Os avisos nascem vencidos no instante do caso de uso. */
    enfileirar(avisos: NovoAviso[], agora: Date): Promise<void>
  }
}

export interface UnidadeDeTrabalho {
  executar<T>(trabalho: (r: Repositorios) => Promise<T>): Promise<T>
}

// ── Leituras no formato da tela ──────────────────────────────────────────────

export interface ConsultaNaAgenda {
  id: string
  inicio: Date
  fim: Date
  status: StatusDaConsulta
  observacoes: string | null
  versao: number
  unidade: { id: string; nome: string }
  cadeira: { id: string; nome: string }
  profissional: { id: string; nome: string; cor: string }
  paciente: { id: string; nome: string; telefone: string | null }
  procedimento: { id: string; nome: string; cor: string }
}

export interface PacienteEncontrado {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  nascimento: string | null
}

/** O paciente na lista da tela: com as observações e quando foi cadastrado. */
export interface PacienteDaLista extends PacienteEncontrado {
  observacoes: string | null
  criadoEm: Date
}

export interface FiltroDaAgenda {
  de: Date
  ate: Date
  /** `null`: todas as unidades. */
  unidadeIds: string[] | null
  profissionalId?: string
}

export interface LeiturasDaAgenda {
  agendaDoPeriodo(clinicaId: string, filtro: FiltroDaAgenda): Promise<ConsultaNaAgenda[]>
  consulta(clinicaId: string, consultaId: string): Promise<ConsultaNaAgenda | null>
  /** Pelo nome sem acento, ou pelos dígitos do telefone. */
  buscarPacientes(clinicaId: string, texto: string, limite: number): Promise<PacienteEncontrado[]>
  /** A lista da tela, por nome, numa página; com `busca`, só os que batem (como em buscarPacientes). */
  listarPacientes(clinicaId: string, filtro: { busca: string | null; limite: number; deslocamento: number }): Promise<{ pacientes: PacienteDaLista[]; total: number }>
  /** Todas as consultas do paciente, da mais recente para a mais antiga. */
  consultasDoPaciente(clinicaId: string, pacienteId: string): Promise<ConsultaNaAgenda[]>
  /** As vindas do CRM que esperam a recepção, pelo horário. `null`: todas as unidades. */
  vindasPendentes(clinicaId: string, unidadeIds: string[] | null): Promise<VindaNaLista[]>
}

/** A vinda do CRM na lista da recepção (fase 7b). */
export interface VindaNaLista {
  id: string
  tipo: TipoDeVinda
  motivo: string | null
  crmCardId: string
  unidade: { id: string; nome: string } | null
  nome: string | null
  telefone: string
  inicio: Date
  fim: Date | null
  profissionalNoProntuario: { id: string; nome: string | null } | null
  /** Na remarcação, a consulta como está hoje na agenda. */
  consultaAtual: { id: string; inicio: Date; profissional: { id: string; nome: string } } | null
  criadoEm: Date
}
