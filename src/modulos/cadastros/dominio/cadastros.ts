import { ErroDeDominio } from '@/compartilhado/erros'
import { minutosDaHora } from '@/compartilhado/fuso'
import { TIPOS_DE_BLOQUEIO, type TipoDeBloqueio } from '@/compartilhado/vocabulario'

// As regras dos cadastros da clínica (docs/modelo-de-dados.md, "A clínica por
// dentro" e "Profissionais"). O banco garante o resto: nome que não repete,
// tudo da mesma clínica e expedientes que não se cruzam.

const TAMANHO_DO_NOME = 120

/** O nome sem espaços sobrando; vazio ou comprido demais é recusado. */
export function nomeLimpo(nome: string, doQue: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ')
  if (!limpo) throw new ErroDeDominio('invalido', 'NOME_OBRIGATORIO', `Informe o nome ${doQue}`)
  if (limpo.length > TAMANHO_DO_NOME) throw new ErroDeDominio('invalido', 'NOME_LONGO', `O nome ${doQue} passa de ${TAMANHO_DO_NOME} letras`)
  return limpo
}

/** Texto opcional: vazio vira `null`. */
export const textoOpcional = (texto: string | null | undefined) => texto?.trim() || null

/** A cor na agenda, em `#RRGGBB`, sempre maiúscula. */
export function corValida(cor: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(cor.trim())) throw new ErroDeDominio('invalido', 'COR_INVALIDA', `Cor inválida: "${cor}". Use o formato #RRGGBB`)
  return cor.trim().toUpperCase()
}

export function duracaoValida(minutos: number): number {
  if (!Number.isInteger(minutos) || minutos < 5 || minutos > 480) {
    throw new ErroDeDominio('invalido', 'DURACAO_INVALIDA', 'A duração vai de 5 minutos a 8 horas')
  }
  return minutos
}

export function prioridadeValida(prioridade: number): number {
  if (!Number.isInteger(prioridade) || prioridade < 0 || prioridade > 1000) {
    throw new ErroDeDominio('invalido', 'PRIORIDADE_INVALIDA', 'A prioridade é um número de 0 a 1000; o menor vem primeiro')
  }
  return prioridade
}

// ── Expedientes ──────────────────────────────────────────────────────────────

/** Um intervalo de trabalho, em hora de parede no fuso da clínica. */
export interface IntervaloDeTrabalho {
  unidadeId: string
  /** 0 (domingo) a 6 (sábado). */
  diaSemana: number
  /** "08:00". */
  inicio: string
  /** "12:00". */
  fim: string
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function minutos(hora: string): number {
  try {
    return minutosDaHora(hora)
  } catch {
    throw new ErroDeDominio('invalido', 'HORA_INVALIDA', `Hora inválida: "${hora}". Use o formato 08:00`)
  }
}

const hora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * Confere a semana inteira de um profissional: cada intervalo numa unidade onde
 * ele atende, o fim depois do início, e nenhum cruzando outro no mesmo dia, nem
 * em unidades diferentes. Devolve os intervalos em ordem, com as horas no
 * formato curto.
 */
export function conferirExpedientes(intervalos: readonly IntervaloDeTrabalho[], unidadesDoProfissional: readonly string[]): IntervaloDeTrabalho[] {
  const lidos = intervalos.map((i) => {
    if (!Number.isInteger(i.diaSemana) || i.diaSemana < 0 || i.diaSemana > 6) {
      throw new ErroDeDominio('invalido', 'DIA_INVALIDO', 'O dia da semana vai de 0 (domingo) a 6 (sábado)')
    }
    if (!unidadesDoProfissional.includes(i.unidadeId)) {
      throw new ErroDeDominio('invalido', 'UNIDADE_SEM_O_PROFISSIONAL', 'O expediente é numa unidade onde o profissional não atende')
    }
    const [inicio, fim] = [minutos(i.inicio), minutos(i.fim)]
    if (fim <= inicio) throw new ErroDeDominio('invalido', 'FIM_ANTES_DO_INICIO', `No expediente de ${DIAS[i.diaSemana]}, o fim vem antes do início`)
    return { ...i, de: inicio, ate: fim }
  })
  lidos.sort((a, b) => a.diaSemana - b.diaSemana || a.de - b.de)
  for (let k = 1; k < lidos.length; k++) {
    const [antes, este] = [lidos[k - 1]!, lidos[k]!]
    if (antes.diaSemana === este.diaSemana && este.de < antes.ate) {
      throw new ErroDeDominio(
        'invalido',
        'EXPEDIENTES_SE_CRUZAM',
        `Na ${DIAS[este.diaSemana]}, os horários ${hora(antes.de)} a ${hora(antes.ate)} e ${hora(este.de)} a ${hora(este.ate)} se cruzam`
      )
    }
  }
  return lidos.map(({ unidadeId, diaSemana, de, ate }) => ({ unidadeId, diaSemana, inicio: hora(de), fim: hora(ate) }))
}

// ── Bloqueios ────────────────────────────────────────────────────────────────

const MAXIMO_DE_DIAS_DO_BLOQUEIO = 366

export function conferirBloqueio(pedido: { inicio: Date; fim: Date; tipo: string }): { inicio: Date; fim: Date; tipo: TipoDeBloqueio } {
  if (!(TIPOS_DE_BLOQUEIO as readonly string[]).includes(pedido.tipo)) {
    throw new ErroDeDominio('invalido', 'TIPO_INVALIDO', `O tipo do bloqueio é um destes: ${TIPOS_DE_BLOQUEIO.join(', ')}`)
  }
  if (pedido.fim <= pedido.inicio) throw new ErroDeDominio('invalido', 'FIM_ANTES_DO_INICIO', 'O fim do bloqueio vem antes do início')
  if (pedido.fim.getTime() - pedido.inicio.getTime() > MAXIMO_DE_DIAS_DO_BLOQUEIO * 24 * 3_600_000) {
    throw new ErroDeDominio('invalido', 'BLOQUEIO_LONGO', 'O bloqueio vai até um ano; para quem saiu da clínica, desative o profissional')
  }
  return { inicio: pedido.inicio, fim: pedido.fim, tipo: pedido.tipo as TipoDeBloqueio }
}
