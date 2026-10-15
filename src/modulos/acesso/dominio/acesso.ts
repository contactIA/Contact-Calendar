import { ErroDeDominio } from '@/compartilhado/erros'
import type { TipoDeAtor } from '@/compartilhado/vocabulario'

// Quem está fazendo o pedido, e o que isso permite (docs/modelo-de-dados.md,
// "Clínica e acesso"). Toda porta de entrada (a tela, a API, o agente de IA, o
// worker) chega aos casos de uso com um Acesso já resolvido, e as regras de papel
// moram aqui, num lugar só, como no CRM:
//
//   · o gestor faz tudo;
//   · a recepção agenda, remarca, cancela, marca falta e chegada e cadastra paciente;
//   · o dentista vê e marca chegada e atendimento das consultas dele; não agenda,
//     não cancela nem marca falta;
//   · a chave do agente de IA e a das integrações agendam, remarcam, cancelam e
//     confirmam, se a chave pode gravar;
//   · quem tem unidades vinculadas vê só as delas; o gestor e as chaves veem todas.

export interface Papeis {
  gestor: boolean
  recepcao: boolean
  dentista: boolean
}

export interface AcessoDeUsuario {
  tipo: 'usuario'
  clinicaId: string
  usuarioId: string
  nome: string
  papeis: Papeis
  /** O profissional ligado ao usuário, quando ele é dentista. */
  profissionalId: string | null
  /** As unidades vinculadas. Vazia ou ausente: todas. */
  unidades?: string[]
}

export interface AcessoDeChave {
  /** `ia` é a chave do agente de IA; `integracao`, a dos outros sistemas. */
  tipo: 'ia' | 'integracao'
  clinicaId: string
  chaveId: string
  nome: string
  podeEscrever: boolean
}

/** As tarefas em segundo plano. */
export interface AcessoDoSistema {
  tipo: 'sistema'
  clinicaId: string
  /** `crm`: a mudança veio de um aviso do CRM (fase 7b), e não volta a ele. */
  origem?: 'crm'
}

export type Acesso = AcessoDeUsuario | AcessoDeChave | AcessoDoSistema

/** Quem fez, para o histórico. */
export interface Ator {
  tipo: TipoDeAtor
  id: string | null
}

export function atorDo(acesso: Acesso): Ator {
  switch (acesso.tipo) {
    case 'usuario':
      return { tipo: 'usuario', id: acesso.usuarioId }
    case 'sistema':
      return { tipo: 'sistema', id: null }
    default:
      return { tipo: acesso.tipo, id: acesso.chaveId }
  }
}

export const ehChave = (acesso: Acesso): acesso is AcessoDeChave => acesso.tipo === 'ia' || acesso.tipo === 'integracao'

/** A recepção da clínica: o gestor, a recepção e as chaves. O dentista, sozinho, não. */
export function cuidaDaAgenda(acesso: Acesso): boolean {
  if (acesso.tipo === 'usuario') return acesso.papeis.gestor || acesso.papeis.recepcao
  return true
}

export function exigirEscrita(acesso: Acesso): void {
  if (ehChave(acesso) && !acesso.podeEscrever) {
    throw new ErroDeDominio('proibido', 'CHAVE_SO_LEITURA', 'Esta chave da API só pode ler')
  }
}

export function exigirQueCuidaDaAgenda(acesso: Acesso): void {
  exigirEscrita(acesso)
  if (!cuidaDaAgenda(acesso)) {
    throw new ErroDeDominio('proibido', 'SO_RECEPCAO', 'Só a recepção e o gestor podem fazer isso')
  }
}

/** Os cadastros da clínica e as chaves são do gestor. As chaves da API só leem os cadastros. */
export function exigirGestor(acesso: Acesso): void {
  if (acesso.tipo === 'usuario' && acesso.papeis.gestor) return
  throw new ErroDeDominio('proibido', 'SO_GESTOR', 'Só o gestor pode fazer isso')
}

/** As unidades que o acesso enxerga; `null` quando são todas. */
export function unidadesVisiveis(acesso: Acesso): string[] | null {
  if (acesso.tipo !== 'usuario' || acesso.papeis.gestor || !acesso.unidades?.length) return null
  return acesso.unidades
}

export function veUnidade(acesso: Acesso, unidadeId: string): boolean {
  const visiveis = unidadesVisiveis(acesso)
  return visiveis === null || visiveis.includes(unidadeId)
}

/**
 * O profissional cuja agenda o acesso está preso: o dentista que não é gestor nem
 * recepção vê só a dele. `undefined` quando vê todas; `null` quando é dentista sem
 * profissional ligado (não vê nenhuma).
 */
export function profissionalVisivel(acesso: Acesso): string | null | undefined {
  if (acesso.tipo !== 'usuario' || cuidaDaAgenda(acesso)) return undefined
  return acesso.profissionalId
}
