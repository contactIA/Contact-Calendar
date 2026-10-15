import { describe, expect, it } from 'vitest'
import { assinaturaNoPrazo, lerAssinatura, lerAviso, pedidoDoAviso, saidaVale, type AvisoDoCrm } from './entrada'

const HEX = 'a'.repeat(64)

describe('a assinatura do aviso', () => {
  it('lê o t e o v1 do cabeçalho', () => {
    expect(lerAssinatura(`t=1791290280,v1=${HEX}`)).toEqual({ t: 1791290280, v1: HEX })
    expect(lerAssinatura(` v1=${HEX.toUpperCase()} , t=1791290280 `)).toEqual({ t: 1791290280, v1: HEX })
  })

  it('recusa o cabeçalho incompleto ou estranho', () => {
    expect(lerAssinatura(null)).toBeNull()
    expect(lerAssinatura(`t=1791290280`)).toBeNull()
    expect(lerAssinatura(`v1=${HEX}`)).toBeNull()
    expect(lerAssinatura(`t=abc,v1=${HEX}`)).toBeNull()
    expect(lerAssinatura(`t=1791290280,v1=xyz`)).toBeNull()
  })

  it('vale por dez minutos, para os dois lados', () => {
    const agora = new Date('2026-10-07T12:00:00Z')
    const t = agora.getTime() / 1000
    expect(assinaturaNoPrazo(t - 600, agora)).toBe(true)
    expect(assinaturaNoPrazo(t + 600, agora)).toBe(true)
    expect(assinaturaNoPrazo(t - 601, agora)).toBe(false)
  })
})

const aviso = (extra: Partial<AvisoDoCrm>): AvisoDoCrm => ({
  id: 1,
  evento: 'card.movido',
  tipo: 'movido',
  clinica: { id: 'c', companyId: 'x' },
  card: { id: 'k' },
  para: null,
  ator: { tipo: 'usuario', id: 'u' },
  dados: null,
  ...extra,
})

describe('o corpo do aviso', () => {
  it('lê só o que a agenda usa', () => {
    expect(
      lerAviso({
        id: 7,
        evento: 'card.movido',
        tipo: 'movido',
        eventoId: 99,
        clinica: { id: 'c', companyId: 'x' },
        card: { id: 'k', titulo: 'Maria' },
        de: { chave: 'leads', nome: 'Leads' },
        para: { chave: 'agendados', nome: 'Agendados' },
        ator: { tipo: 'integracao', id: 'chave', nome: 'Botão' },
        dados: {},
      })
    ).toEqual({
      id: 7,
      evento: 'card.movido',
      tipo: 'movido',
      clinica: { id: 'c', companyId: 'x' },
      card: { id: 'k' },
      para: { chave: 'agendados' },
      ator: { tipo: 'integracao', id: 'chave' },
      dados: {},
    })
  })

  it('o que não é aviso do CRM é nada', () => {
    expect(lerAviso(null)).toBeNull()
    expect(lerAviso({ id: '7', evento: 'card.movido', tipo: 'movido', clinica: { id: 'c', companyId: 'x' } })).toBeNull()
    expect(lerAviso({ id: 7, evento: 'card.movido', tipo: 'movido' })).toBeNull()
  })
})

describe('o que cada aviso pede', () => {
  it('entrar em Agendados, mudar a data e registrar a consulta da Clinicorp: conferir o agendamento', () => {
    expect(pedidoDoAviso(aviso({ para: { chave: 'agendados' } }))).toEqual({ tipo: 'agendamento' })
    expect(pedidoDoAviso(aviso({ evento: 'card.alterado', tipo: 'campo_alterado', dados: { campo: 'agendadoPara' } }))).toEqual({ tipo: 'agendamento' })
    expect(pedidoDoAviso(aviso({ evento: 'card.alterado', tipo: 'consulta_no_prontuario' }))).toEqual({ tipo: 'agendamento' })
    expect(pedidoDoAviso(aviso({ evento: 'card.criado', tipo: 'criado' }))).toEqual({ tipo: 'agendamento' })
  })

  it('sair de Agendados para outra coluna, ou para Perda, também confere (a vinda sai da lista)', () => {
    expect(pedidoDoAviso(aviso({ para: { chave: 'leads' } }))).toEqual({ tipo: 'agendamento' })
    expect(pedidoDoAviso(aviso({ tipo: 'perdido' }))).toEqual({ tipo: 'agendamento' })
  })

  it('Cancelados, Faltosos e o CRC2 são saídas', () => {
    expect(pedidoDoAviso(aviso({ para: { chave: 'cancelados' } }))).toEqual({ tipo: 'saida', saida: 'cancelada' })
    expect(pedidoDoAviso(aviso({ para: { chave: 'faltosos' } }))).toEqual({ tipo: 'saida', saida: 'faltou' })
    expect(pedidoDoAviso(aviso({ tipo: 'passou_para_crc2', para: { chave: 'avaliacao' } }))).toEqual({ tipo: 'saida', saida: 'concluida' })
  })

  it('o resto não interessa à agenda', () => {
    expect(pedidoDoAviso(aviso({ evento: 'card.alterado', tipo: 'campo_alterado', dados: { campo: 'titulo' } }))).toBeNull()
    expect(pedidoDoAviso(aviso({ evento: 'card.alterado', tipo: 'lembrete_agendado' }))).toBeNull()
    expect(pedidoDoAviso(aviso({ card: null, para: { chave: 'agendados' } }))).toBeNull()
  })

  it('a saída só vale se o card ainda está lá', () => {
    expect(saidaVale('cancelada', { painel: 'crc1', etapa: 'cancelados' })).toBe(true)
    expect(saidaVale('cancelada', { painel: 'crc1', etapa: 'agendados' })).toBe(false)
    expect(saidaVale('faltou', { painel: 'crc1', etapa: 'faltosos' })).toBe(true)
    expect(saidaVale('concluida', { painel: 'crc2', etapa: 'avaliacao' })).toBe(true)
    expect(saidaVale('concluida', { painel: 'crc1', etapa: 'agendados' })).toBe(false)
  })
})
