import { describe, expect, it } from 'vitest'
import { conferirBloqueio, conferirExpedientes, corValida, duracaoValida, nomeLimpo } from './cadastros'

const codigo = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    return (e as { codigo?: string }).codigo
  }
  return null
}

describe('cadastros', () => {
  it('o nome sai sem espaços sobrando, e vazio é recusado', () => {
    expect(nomeLimpo('  Consultório   1 ', 'da cadeira')).toBe('Consultório 1')
    expect(codigo(() => nomeLimpo('   ', 'da cadeira'))).toBe('NOME_OBRIGATORIO')
  })

  it('a cor é #RRGGBB e a duração vai de 5 minutos a 8 horas', () => {
    expect(corValida('#10b981')).toBe('#10B981')
    expect(codigo(() => corValida('verde'))).toBe('COR_INVALIDA')
    expect(duracaoValida(30)).toBe(30)
    expect(codigo(() => duracaoValida(4))).toBe('DURACAO_INVALIDA')
    expect(codigo(() => duracaoValida(481))).toBe('DURACAO_INVALIDA')
  })

  describe('expedientes', () => {
    const centro = 'u-centro'
    const bairro = 'u-bairro'

    it('manhã e tarde no mesmo dia, em ordem e com a hora curta', () => {
      expect(
        conferirExpedientes(
          [
            { unidadeId: centro, diaSemana: 1, inicio: '14:00', fim: '18:00' },
            { unidadeId: centro, diaSemana: 1, inicio: '08:00:00', fim: '12:00' },
          ],
          [centro]
        )
      ).toEqual([
        { unidadeId: centro, diaSemana: 1, inicio: '08:00', fim: '12:00' },
        { unidadeId: centro, diaSemana: 1, inicio: '14:00', fim: '18:00' },
      ])
    })

    it('dois intervalos que se cruzam no mesmo dia, mesmo em unidades diferentes, são recusados', () => {
      const semana = [
        { unidadeId: centro, diaSemana: 2, inicio: '08:00', fim: '12:00' },
        { unidadeId: bairro, diaSemana: 2, inicio: '11:00', fim: '15:00' },
      ]
      expect(codigo(() => conferirExpedientes(semana, [centro, bairro]))).toBe('EXPEDIENTES_SE_CRUZAM')
      // Encostar não é cruzar.
      expect(conferirExpedientes([semana[0]!, { ...semana[1]!, inicio: '12:00' }], [centro, bairro])).toHaveLength(2)
    })

    it('o expediente é numa unidade onde o profissional atende, com o fim depois do início', () => {
      expect(codigo(() => conferirExpedientes([{ unidadeId: bairro, diaSemana: 1, inicio: '08:00', fim: '12:00' }], [centro]))).toBe(
        'UNIDADE_SEM_O_PROFISSIONAL'
      )
      expect(codigo(() => conferirExpedientes([{ unidadeId: centro, diaSemana: 1, inicio: '12:00', fim: '08:00' }], [centro]))).toBe(
        'FIM_ANTES_DO_INICIO'
      )
      expect(codigo(() => conferirExpedientes([{ unidadeId: centro, diaSemana: 7, inicio: '08:00', fim: '12:00' }], [centro]))).toBe(
        'DIA_INVALIDO'
      )
      expect(codigo(() => conferirExpedientes([{ unidadeId: centro, diaSemana: 1, inicio: '8h', fim: '12:00' }], [centro]))).toBe('HORA_INVALIDA')
    })
  })

  it('o bloqueio tem tipo da lista, fim depois do início e até um ano', () => {
    const inicio = new Date('2026-10-08T12:00:00Z')
    expect(conferirBloqueio({ inicio, fim: new Date('2026-10-08T13:00:00Z'), tipo: 'reuniao' }).tipo).toBe('reuniao')
    expect(codigo(() => conferirBloqueio({ inicio, fim: inicio, tipo: 'reuniao' }))).toBe('FIM_ANTES_DO_INICIO')
    expect(codigo(() => conferirBloqueio({ inicio, fim: new Date('2026-10-09T12:00:00Z'), tipo: 'ferias' }))).toBe('TIPO_INVALIDO')
    expect(codigo(() => conferirBloqueio({ inicio, fim: new Date('2027-10-10T12:00:00Z'), tipo: 'ausencia' }))).toBe('BLOQUEIO_LONGO')
  })
})
