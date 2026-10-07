import { ErroDeDominio } from '@/compartilhado/erros'

// O paciente e como achar o paciente certo pelo telefone.
//
// O telefone pode repetir na clínica (decisão D1): a mãe marca para o filho com o
// número dela. Por isso o telefone sozinho nem sempre basta, e o nome desempata.

export interface Paciente {
  id: string
  clinicaId: string
  nome: string
  telefone: string | null
  email: string | null
  /** AAAA-MM-DD. */
  nascimento: string | null
  observacoes: string | null
  contatoPlataformaId: string | null
}

/** Para comparar nomes: sem acento, sem diferença de maiúsculas, espaços simples. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const primeiroNome = (nome: string) => normalizarNome(nome).split(' ')[0] ?? ''

export type Escolha = { tipo: 'um'; id: string } | { tipo: 'nenhum' } | { tipo: 'varios'; opcoes: { id: string; nome: string }[] }

/**
 * Entre os pacientes com o mesmo telefone, qual é o da conversa:
 *   · sem nome informado, só dá para escolher quando há um paciente com o número;
 *   · com nome, vale o nome inteiro igual; senão, o mesmo primeiro nome;
 *   · nenhum bate: é outra pessoa da família, e o caso de uso cadastra.
 */
export function escolherPaciente(candidatos: readonly { id: string; nome: string }[], nomeInformado?: string | null): Escolha {
  if (candidatos.length === 0) return { tipo: 'nenhum' }
  const nome = nomeInformado?.trim()
  if (!nome) return candidatos.length === 1 ? { tipo: 'um', id: candidatos[0]!.id } : { tipo: 'varios', opcoes: [...candidatos] }

  const inteiro = candidatos.filter((c) => normalizarNome(c.nome) === normalizarNome(nome))
  if (inteiro.length === 1) return { tipo: 'um', id: inteiro[0]!.id }
  const mesmoPrimeiro = inteiro.length > 1 ? inteiro : candidatos.filter((c) => primeiroNome(c.nome) === primeiroNome(nome))
  if (mesmoPrimeiro.length === 1) return { tipo: 'um', id: mesmoPrimeiro[0]!.id }
  if (mesmoPrimeiro.length > 1) return { tipo: 'varios', opcoes: [...mesmoPrimeiro] }
  return { tipo: 'nenhum' }
}

export function pacienteAmbiguo(opcoes: { id: string; nome: string }[]): ErroDeDominio {
  const nomes = opcoes.map((o) => o.nome).join(', ')
  return new ErroDeDominio('conflito', 'PACIENTE_AMBIGUO', `Mais de um paciente com esse telefone (${nomes}): informe o nome completo`)
}

export interface DadosDoPaciente {
  nome: string
  telefone?: string | null
  email?: string | null
  nascimento?: string | null
  observacoes?: string | null
}

/** Confere e limpa o que chega para cadastrar ou alterar. O telefone já vem em E.164. */
export function conferirDadosDoPaciente<T extends Partial<DadosDoPaciente>>(dados: T, hoje: string): T {
  const limpos = { ...dados }
  if (limpos.nome !== undefined) {
    const nome = limpos.nome.trim().replace(/\s+/g, ' ')
    if (!nome) throw new ErroDeDominio('invalido', 'NOME_OBRIGATORIO', 'Informe o nome do paciente')
    limpos.nome = nome
  }
  if (limpos.email) {
    const email = limpos.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroDeDominio('invalido', 'EMAIL_INVALIDO', `E-mail inválido: "${limpos.email}"`)
    limpos.email = email
  }
  if (limpos.nascimento && limpos.nascimento > hoje) {
    throw new ErroDeDominio('invalido', 'NASCIMENTO_NO_FUTURO', 'A data de nascimento está no futuro')
  }
  return limpos
}
