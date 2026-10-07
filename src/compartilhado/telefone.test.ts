import { describe, expect, it } from 'vitest'
import { digitosDoTelefone, normalizarTelefone } from './telefone'

describe('normalizarTelefone', () => {
  it.each([
    ['(62) 99999-0000', '+5562999990000'],
    ['62999990000', '+5562999990000'],
    ['5562999990000', '+5562999990000'],
    ['+55 62 99999-0000', '+5562999990000'],
    // celular antigo, sem o nono dígito
    ['556299990000', '+5562999990000'],
    ['6299990000', '+5562999990000'],
    // fixo
    ['(62) 3222-1100', '+556232221100'],
    ['556232221100', '+556232221100'],
    // outro país
    ['+1 415 555 2671', '+14155552671'],
  ])('%s → %s', (entrada, e164) => {
    expect(normalizarTelefone(entrada)).toBe(e164)
  })

  it.each(['', 'abc', '123', '55629', '+55 62 8999-00001'])('recusa "%s"', (entrada) => {
    expect(() => normalizarTelefone(entrada)).toThrow(/Telefone inválido/)
  })

  it('digitosDoTelefone tira o "+"', () => {
    expect(digitosDoTelefone('+5562999990000')).toBe('5562999990000')
  })
})
