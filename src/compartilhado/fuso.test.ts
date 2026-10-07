import { describe, expect, it } from 'vitest'
import { diaDaSemana, diaNoFuso, diaSeguinte, fusoValido, horaNoFuso, instanteNoFuso, lerData, minutosDaHora } from './fuso'

describe('fuso', () => {
  it('a hora de parede de São Paulo vira o instante certo, sem depender do fuso do servidor', () => {
    expect(instanteNoFuso('2026-10-08', '10:00', 'America/Sao_Paulo').toISOString()).toBe('2026-10-08T13:00:00.000Z')
    expect(instanteNoFuso('2026-10-08', '24:00', 'America/Sao_Paulo').toISOString()).toBe('2026-10-09T03:00:00.000Z')
  })

  it('acompanha o horário de verão de outro fuso', () => {
    // Nova York: 2026-03-08 às 2h o relógio pula para 3h.
    expect(instanteNoFuso('2026-03-07', '09:00', 'America/New_York').toISOString()).toBe('2026-03-07T14:00:00.000Z')
    expect(instanteNoFuso('2026-03-09', '09:00', 'America/New_York').toISOString()).toBe('2026-03-09T13:00:00.000Z')
    // 02:30 não existe nesse dia: cai depois do pulo.
    expect(instanteNoFuso('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z')
  })

  it('o caminho de volta: o dia e a hora no fuso', () => {
    const instante = new Date('2026-10-09T02:30:00Z')
    expect(diaNoFuso(instante, 'America/Sao_Paulo')).toBe('2026-10-08')
    expect(horaNoFuso(instante, 'America/Sao_Paulo')).toBe('23:30')
  })

  it('dia da semana e dia seguinte', () => {
    expect(diaDaSemana('2026-10-08')).toBe(4) // quinta
    expect(diaDaSemana('2026-10-11')).toBe(0) // domingo
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01')
  })

  it('recusa data e hora que não existem', () => {
    expect(lerData('2026-02-30')).toBeNull()
    expect(lerData('08/10/2026')).toBeNull()
    expect(() => minutosDaHora('25:00')).toThrow()
    expect(() => minutosDaHora('24:30')).toThrow()
    expect(minutosDaHora('08:30')).toBe(510)
    expect(fusoValido('America/Sao_Paulo')).toBe(true)
    expect(fusoValido('Brasil/Goiania')).toBe(false)
  })
})
