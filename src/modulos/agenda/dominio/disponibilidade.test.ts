import { describe, expect, it } from 'vitest'
import { conferirHorario, horariosLivres, janelasDoExpediente, type EntradaDosHorariosLivres, type Janela } from './disponibilidade'

// Os cenários do README da agenda antiga ("Slots: duração real do procedimento e
// cadência da grade") viraram testes, mais os casos novos.

const FUSO = 'America/Sao_Paulo'
const DIA = '2026-10-08'
const h = (hora: string, dia = DIA) => new Date(`${dia}T${hora}:00-03:00`)
const janela = (de: string, ate: string): Janela => ({ inicio: h(de), fim: h(ate) })
const horas = (livres: { inicio: Date; fim: Date }[]) =>
  livres.map((l) => `${l.inicio.toISOString().slice(11, 16)}-${l.fim.toISOString().slice(11, 16)}`)
// Em UTC: 09:00 em São Paulo é 12:00Z.

function entrada(extra: Partial<EntradaDosHorariosLivres> = {}): EntradaDosHorariosLivres {
  return {
    data: DIA,
    fuso: FUSO,
    cadenciaMinutos: 30,
    duracaoMinutos: 90,
    expedientes: [{ inicio: '09:00', fim: '12:00' }],
    ocupacoesDoProfissional: [],
    cadeiras: [{ id: 'c1', ocupacoes: [] }],
    agora: h('07:00'),
    ...extra,
  }
}

describe('horários livres: os cenários do README', () => {
  it('90 minutos, cadência 30, agenda livre', () => {
    expect(horas(horariosLivres(entrada()))).toEqual(['12:00-13:30', '12:30-14:00', '13:00-14:30', '13:30-15:00'])
  })

  it('90 minutos, cadência 60', () => {
    expect(horas(horariosLivres(entrada({ cadenciaMinutos: 60 })))).toEqual(['12:00-13:30', '13:00-14:30'])
  })

  it('90 minutos, com uma consulta das 10h às 11h: nenhum horário livre', () => {
    expect(horariosLivres(entrada({ ocupacoesDoProfissional: [janela('10:00', '11:00')] }))).toEqual([])
  })
})

describe('horários livres: o que entrou agora', () => {
  it('nada no passado', () => {
    expect(horas(horariosLivres(entrada({ agora: h('09:40') })))).toEqual(['13:00-14:30', '13:30-15:00'])
  })

  it('o bloqueio tira os horários que cruzam com ele, e encostar não cruza', () => {
    const livres = horariosLivres(entrada({ duracaoMinutos: 30, ocupacoesDoProfissional: [janela('10:00', '11:00')] }))
    expect(horas(livres)).toEqual(['12:00-12:30', '12:30-13:00', '14:00-14:30', '14:30-15:00'])
  })

  it('precisa de uma cadeira livre, e escolhe a primeira livre', () => {
    const ocupadas = horariosLivres(entrada({ duracaoMinutos: 60, cadenciaMinutos: 60, cadeiras: [{ id: 'c1', ocupacoes: [janela('09:00', '12:00')] }] }))
    expect(ocupadas).toEqual([])
    const livres = horariosLivres(
      entrada({
        duracaoMinutos: 60,
        cadenciaMinutos: 60,
        cadeiras: [
          { id: 'c1', ocupacoes: [janela('09:00', '10:00')] },
          { id: 'c2', ocupacoes: [] },
        ],
      })
    )
    expect(livres.map((l) => l.cadeiraId)).toEqual(['c2', 'c1', 'c1'])
  })

  it('o paciente ocupado em outra consulta também tira o horário', () => {
    const livres = horariosLivres(entrada({ duracaoMinutos: 60, cadenciaMinutos: 60, ocupacoesDoPaciente: [janela('10:00', '10:30')] }))
    expect(horas(livres)).toEqual(['12:00-13:00', '14:00-15:00'])
  })

  it('manhã e tarde: a cadência conta do início de cada intervalo', () => {
    const livres = horariosLivres(
      entrada({
        duracaoMinutos: 60,
        cadenciaMinutos: 60,
        expedientes: [
          { inicio: '14:30', fim: '16:30' },
          { inicio: '08:00', fim: '10:00' },
        ],
      })
    )
    expect(horas(livres)).toEqual(['11:00-12:00', '12:00-13:00', '17:30-18:30', '18:30-19:30'])
  })

  it('sem expediente no dia, sem horário', () => {
    expect(horariosLivres(entrada({ expedientes: [] }))).toEqual([])
  })

  it('o fuso vem por parâmetro, não do servidor', () => {
    const livres = horariosLivres(entrada({ fuso: 'America/Manaus', duracaoMinutos: 60, cadenciaMinutos: 60 }))
    // 09:00 em Manaus (UTC-4) é 13:00Z.
    expect(horas(livres)[0]).toBe('13:00-14:00')
  })
})

describe('conferir um horário pedido', () => {
  const base = {
    janela: janela('09:00', '10:00'),
    expediente: janelasDoExpediente(DIA, FUSO, [{ inicio: '09:00', fim: '12:00' }]),
    podeEncaixar: false,
    agora: h('07:00'),
    ocupacoesDoProfissional: [] as Janela[],
    ocupacoesDoPaciente: [] as Janela[],
    cadeiras: [
      { id: 'c1', ocupacoes: [janela('09:00', '09:30')] },
      { id: 'c2', ocupacoes: [] },
    ],
  }
  const erro = (f: () => unknown) => {
    try {
      f()
    } catch (e) {
      return (e as { codigo: string }).codigo
    }
    return null
  }

  it('devolve a primeira cadeira livre, ou a preferida se estiver livre', () => {
    expect(conferirHorario(base)).toBe('c2')
    expect(conferirHorario({ ...base, janela: janela('10:00', '11:00'), cadeiraPreferida: 'c2' })).toBe('c2')
    expect(conferirHorario({ ...base, janela: janela('10:00', '11:00') })).toBe('c1')
  })

  it('a chave só marca no futuro e dentro do expediente; a recepção pode encaixar', () => {
    expect(erro(() => conferirHorario({ ...base, agora: h('09:30') }))).toBe('HORARIO_NO_PASSADO')
    expect(erro(() => conferirHorario({ ...base, janela: janela('11:30', '12:30') }))).toBe('FORA_DO_EXPEDIENTE')
    expect(conferirHorario({ ...base, janela: janela('11:30', '12:30'), podeEncaixar: true })).toBe('c1')
  })

  it('profissional, paciente e cadeira pedida ocupados são recusados com o motivo', () => {
    expect(erro(() => conferirHorario({ ...base, ocupacoesDoProfissional: [janela('09:30', '10:30')] }))).toBe('HORARIO_DO_PROFISSIONAL_OCUPADO')
    expect(erro(() => conferirHorario({ ...base, ocupacoesDoPaciente: [janela('09:00', '09:15')] }))).toBe('PACIENTE_JA_TEM_CONSULTA')
    expect(erro(() => conferirHorario({ ...base, cadeiraPreferida: 'c1', cadeiraObrigatoria: true }))).toBe('CADEIRA_OCUPADA')
    expect(erro(() => conferirHorario({ ...base, cadeiraPreferida: 'cx', cadeiraObrigatoria: true }))).toBe('CADEIRA_NAO_ENCONTRADA')
    expect(erro(() => conferirHorario({ ...base, cadeiras: [{ id: 'c1', ocupacoes: [janela('08:00', '12:00')] }] }))).toBe('SEM_CADEIRA_LIVRE')
  })
})
