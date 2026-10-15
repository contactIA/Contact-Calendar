import type { TipoDeBloqueio } from '@/compartilhado/vocabulario'
import type { IntervaloDeTrabalho } from '../dominio/cadastros'

// As fronteiras dos cadastros da clínica: o banco, visto como um repositório
// dentro de uma transação. O adaptador fica em ../infraestrutura.

export interface Unidade {
  id: string
  nome: string
  endereco: string | null
  telefone: string | null
  ativa: boolean
  /** A unidade correspondente no CRM, para o card nascer nela. */
  crmUnidadeId: string | null
}

export interface Cadeira {
  id: string
  unidadeId: string
  nome: string
  ativa: boolean
}

export interface Especialidade {
  id: string
  nome: string
}

export interface Procedimento {
  id: string
  nome: string
  duracaoMinutos: number
  cor: string
  /** Vazia: qualquer profissional faz. */
  especialidadeId: string | null
  ativo: boolean
}

export interface UnidadeDoProfissional {
  unidadeId: string
  /** Menor vem primeiro na recomendação do agente. */
  prioridade: number
}

export interface Profissional {
  id: string
  nome: string
  cro: string | null
  cor: string
  usuarioId: string | null
  /** O dentista no prontuário (a Clinicorp), para a consulta que o CRM marca lá entrar sozinha. */
  idNoProntuario: string | null
  ativo: boolean
  especialidadeIds: string[]
  unidades: UnidadeDoProfissional[]
}

export interface Expediente extends IntervaloDeTrabalho {
  id: string
}

export interface Bloqueio {
  id: string
  profissionalId: string
  /** Só para mostrar: o bloqueio tira o profissional de todas as unidades. */
  unidadeId: string | null
  inicio: Date
  fim: Date
  tipo: TipoDeBloqueio
  motivo: string | null
  criadoPorId: string | null
}

export interface FiltroDeBloqueios {
  de: Date
  ate: Date
  profissionalId?: string
}

/**
 * O que repete o nome na clínica (ou na unidade, a cadeira) é recusado pelo
 * banco; o adaptador traduz para o erro de domínio `NOME_REPETIDO`.
 */
export interface RepositorioDeCadastros {
  unidades: {
    listar(clinicaId: string): Promise<Unidade[]>
    obter(clinicaId: string, id: string): Promise<Unidade | null>
    inserir(clinicaId: string, unidade: Unidade): Promise<void>
    atualizar(clinicaId: string, unidade: Unidade): Promise<void>
  }
  cadeiras: {
    listar(clinicaId: string, unidadeId?: string): Promise<Cadeira[]>
    obter(clinicaId: string, id: string): Promise<Cadeira | null>
    inserir(clinicaId: string, cadeira: Cadeira): Promise<void>
    atualizar(clinicaId: string, cadeira: Cadeira): Promise<void>
  }
  especialidades: {
    listar(clinicaId: string): Promise<Especialidade[]>
    obter(clinicaId: string, id: string): Promise<Especialidade | null>
    inserir(clinicaId: string, especialidade: Especialidade): Promise<void>
    atualizar(clinicaId: string, especialidade: Especialidade): Promise<void>
    /** Quantos procedimentos e profissionais usam a especialidade. */
    usos(clinicaId: string, id: string): Promise<number>
    apagar(clinicaId: string, id: string): Promise<void>
  }
  procedimentos: {
    listar(clinicaId: string): Promise<Procedimento[]>
    obter(clinicaId: string, id: string): Promise<Procedimento | null>
    inserir(clinicaId: string, procedimento: Procedimento): Promise<void>
    atualizar(clinicaId: string, procedimento: Procedimento): Promise<void>
  }
  profissionais: {
    listar(clinicaId: string): Promise<Profissional[]>
    obter(clinicaId: string, id: string): Promise<Profissional | null>
    /** Grava o profissional com as especialidades e as unidades dele. */
    inserir(clinicaId: string, profissional: Profissional): Promise<void>
    /** Sair de uma unidade apaga os expedientes dele lá. */
    atualizar(clinicaId: string, profissional: Profissional): Promise<void>
    usuarioExiste(clinicaId: string, usuarioId: string): Promise<boolean>
  }
  expedientes: {
    doProfissional(clinicaId: string, profissionalId: string): Promise<Expediente[]>
    /** Troca a semana inteira do profissional. */
    substituir(clinicaId: string, profissionalId: string, expedientes: Expediente[]): Promise<void>
  }
  clinica: {
    /** O procedimento da consulta que o CRM marca fora da agenda (fase 7b). */
    definirProcedimentoDasVindas(clinicaId: string, procedimentoId: string | null): Promise<void>
  }
  bloqueios: {
    listar(clinicaId: string, filtro: FiltroDeBloqueios): Promise<Bloqueio[]>
    obter(clinicaId: string, id: string): Promise<Bloqueio | null>
    inserir(clinicaId: string, bloqueio: Bloqueio): Promise<void>
    apagar(clinicaId: string, id: string): Promise<void>
  }
}

export interface CadastrosNoBanco {
  executar<T>(trabalho: (r: RepositorioDeCadastros) => Promise<T>): Promise<T>
}
