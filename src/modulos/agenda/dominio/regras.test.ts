import { describe, expect, it } from 'vitest'
import { avisosDaMudanca, exigirRemarcavel, mudarStatus, type Consulta, type QuemMuda } from './consulta'
import { conferirDadosDoPaciente, escolherPaciente, normalizarNome } from './paciente'
import { ordenarProfissionais } from './recomendacao'

const consulta = (extra: Partial<Consulta> = {}): Consulta => ({
  id: 'k',
  clinicaId: 'c',
  unidadeId: 'u',
  cadeiraId: 'cad',
  profissionalId: 'p1',
  pacienteId: 'pac',
  procedimentoId: 'proc',
  inicio: new Date('2026-10-08T13:00:00Z'),
  fim: new Date('2026-10-08T14:00:00Z'),
  status: 'agendada',
  observacoes: null,
  criadaPorTipo: 'usuario',
  criadaPorId: 'u1',
  canceladaEm: null,
  motivoCancelamento: null,
  crmCardId: null,
  versao: 1,
  ...extra,
})
const AGORA = new Date('2026-10-08T12:00:00Z')
const recepcao: QuemMuda = { tipo: 'usuario', cuidaDaAgenda: true, dentista: false, profissionalId: null }
const dentista = (profissionalId: string): QuemMuda => ({ tipo: 'usuario', cuidaDaAgenda: false, dentista: true, profissionalId })
const codigo = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    return (e as { codigo: string }).codigo
  }
  return null
}

describe('o ciclo da consulta', () => {
  it('cancelar guarda a data e o motivo; os outros status limpam', () => {
    const cancelada = mudarStatus(consulta(), 'cancelada', recepcao, AGORA, '  paciente viajou ')
    expect(cancelada).toMatchObject({ status: 'cancelada', canceladaEm: AGORA, motivoCancelamento: 'paciente viajou' })
    expect(mudarStatus(consulta(), 'confirmada', recepcao, AGORA)).toMatchObject({ status: 'confirmada', canceladaEm: null })
  })

  it('o que é final não muda, e não se pula para trás', () => {
    expect(codigo(() => mudarStatus(consulta({ status: 'cancelada', canceladaEm: AGORA }), 'agendada', recepcao, AGORA))).toBe('MUDANCA_DE_STATUS_INVALIDA')
    expect(codigo(() => mudarStatus(consulta({ status: 'concluida' }), 'faltou', recepcao, AGORA))).toBe('MUDANCA_DE_STATUS_INVALIDA')
    expect(codigo(() => mudarStatus(consulta({ status: 'em_atendimento' }), 'faltou', recepcao, AGORA))).toBe('MUDANCA_DE_STATUS_INVALIDA')
    expect(codigo(() => mudarStatus(consulta(), 'agendada', recepcao, AGORA))).toBe('STATUS_IGUAL')
  })

  it('o dentista marca chegada e atendimento, só das consultas dele', () => {
    expect(mudarStatus(consulta(), 'em_atendimento', dentista('p1'), AGORA).status).toBe('em_atendimento')
    expect(codigo(() => mudarStatus(consulta(), 'em_atendimento', dentista('p2'), AGORA))).toBe('STATUS_PROIBIDO')
    expect(codigo(() => mudarStatus(consulta(), 'cancelada', dentista('p1'), AGORA))).toBe('STATUS_PROIBIDO')
    expect(codigo(() => mudarStatus(consulta(), 'faltou', dentista('p1'), AGORA))).toBe('STATUS_PROIBIDO')
  })

  it('a chave do agente confirma e cancela, e nada mais', () => {
    expect(mudarStatus(consulta(), 'confirmada', { tipo: 'ia' }, AGORA).status).toBe('confirmada')
    expect(mudarStatus(consulta(), 'cancelada', { tipo: 'ia' }, AGORA).status).toBe('cancelada')
    expect(codigo(() => mudarStatus(consulta(), 'faltou', { tipo: 'ia' }, AGORA))).toBe('STATUS_PROIBIDO')
  })

  it('só a agendada e a confirmada se remarcam', () => {
    expect(() => exigirRemarcavel(consulta({ status: 'confirmada' }))).not.toThrow()
    expect(codigo(() => exigirRemarcavel(consulta({ status: 'faltou' })))).toBe('CONSULTA_NAO_REMARCAVEL')
  })

  it('os avisos de cada mudança, com o "compareceu" uma vez só', () => {
    expect(avisosDaMudanca('agendada', 'cancelada').map((a) => a.tipo)).toEqual(['consulta_cancelada'])
    expect(avisosDaMudanca('confirmada', 'faltou').map((a) => a.tipo)).toEqual(['paciente_faltou'])
    expect(avisosDaMudanca('agendada', 'em_atendimento').map((a) => a.tipo)).toEqual(['paciente_compareceu'])
    expect(avisosDaMudanca('confirmada', 'concluida').map((a) => a.tipo)).toEqual(['paciente_compareceu'])
    expect(avisosDaMudanca('em_atendimento', 'concluida')).toEqual([])
    expect(avisosDaMudanca('agendada', 'confirmada')).toEqual([])
  })
})

describe('a recomendação de profissional', () => {
  const candidato = (id: string, extra: Partial<Parameters<typeof ordenarProfissionais>[0][number]> = {}) => ({
    id,
    nome: id,
    prioridade: 100,
    especialidadeIds: ['geral'],
    jaAtendeuOPaciente: false,
    consultasNoDia: 0,
    ...extra,
  })

  it('filtra pela especialidade e ordena: histórico, menos consultas no dia, prioridade, nome', () => {
    const ordem = ordenarProfissionais(
      [
        candidato('Bruno', { prioridade: 1, consultasNoDia: 5 }),
        candidato('Ana', { prioridade: 2, consultasNoDia: 5 }),
        candidato('Carla', { jaAtendeuOPaciente: true, consultasNoDia: 9 }),
        candidato('Davi', { consultasNoDia: 1 }),
        candidato('Elis', { especialidadeIds: ['orto'] }),
      ],
      'geral'
    )
    expect(ordem.map((c) => c.id)).toEqual(['Carla', 'Davi', 'Bruno', 'Ana'])
  })
})

describe('achar o paciente pelo telefone', () => {
  const familia = [
    { id: 'mae', nome: 'Maria Souza' },
    { id: 'filho', nome: 'Pedro Souza' },
  ]

  it('um paciente com o número e sem nome informado: é ele', () => {
    expect(escolherPaciente([familia[0]!])).toEqual({ tipo: 'um', id: 'mae' })
    expect(escolherPaciente([], 'Maria')).toEqual({ tipo: 'nenhum' })
  })

  it('a família no mesmo número: o nome desempata', () => {
    expect(escolherPaciente(familia)).toMatchObject({ tipo: 'varios' })
    expect(escolherPaciente(familia, 'pedro')).toEqual({ tipo: 'um', id: 'filho' })
    expect(escolherPaciente(familia, 'Maria Souza')).toEqual({ tipo: 'um', id: 'mae' })
    // Outra pessoa da família: o caso de uso cadastra.
    expect(escolherPaciente(familia, 'João Souza')).toEqual({ tipo: 'nenhum' })
  })

  it('o nome compara sem acento e sem maiúsculas', () => {
    expect(normalizarNome('  JOÃO   Antônio ')).toBe('joao antonio')
    expect(escolherPaciente([{ id: 'j', nome: 'João Antônio' }, ...familia], 'joao antonio')).toEqual({ tipo: 'um', id: 'j' })
  })

  it('os dados do paciente são conferidos', () => {
    expect(conferirDadosDoPaciente({ nome: '  Ana   Lima ', email: ' ANA@EXEMPLO.COM ' }, '2026-10-07')).toEqual({ nome: 'Ana Lima', email: 'ana@exemplo.com' })
    expect(codigo(() => conferirDadosDoPaciente({ nome: '   ' }, '2026-10-07'))).toBe('NOME_OBRIGATORIO')
    expect(codigo(() => conferirDadosDoPaciente({ nascimento: '2027-01-01' }, '2026-10-07'))).toBe('NASCIMENTO_NO_FUTURO')
    expect(codigo(() => conferirDadosDoPaciente({ email: 'ana@' }, '2026-10-07'))).toBe('EMAIL_INVALIDO')
  })
})
