import { describe, expect, it } from 'vitest'
import { cardFora, ErroDoCrm, nadaAFazer, passoDoAviso, proximaTentativa, vaiPassarSozinho } from './entrega'

const QUINTA_10H = new Date('2026-10-08T13:00:00Z')
const SEXTA_9H = new Date('2026-10-09T12:00:00Z')

describe('o passo de cada aviso', () => {
  it('criar e remarcar põem o card em Agendados com a próxima consulta do telefone', () => {
    expect(passoDoAviso('consulta_criada', QUINTA_10H, QUINTA_10H)).toEqual({ tipo: 'agendar', agendadoPara: QUINTA_10H })
    expect(passoDoAviso('consulta_remarcada', SEXTA_9H, QUINTA_10H)).toEqual({ tipo: 'agendar', agendadoPara: QUINTA_10H })
  })

  it('a consulta registrada no passado leva a data dela', () => {
    expect(passoDoAviso('consulta_criada', QUINTA_10H, null)).toEqual({ tipo: 'agendar', agendadoPara: QUINTA_10H })
  })

  it('cancelar e faltar tiram o card de Agendados só quando não sobra outra consulta', () => {
    expect(passoDoAviso('consulta_cancelada', QUINTA_10H, null)).toEqual({ tipo: 'sair', etapa: 'cancelados' })
    expect(passoDoAviso('paciente_faltou', QUINTA_10H, null)).toEqual({ tipo: 'sair', etapa: 'faltosos' })
    expect(passoDoAviso('consulta_cancelada', QUINTA_10H, SEXTA_9H)).toEqual({ tipo: 'agendar', agendadoPara: SEXTA_9H })
    expect(passoDoAviso('paciente_faltou', QUINTA_10H, SEXTA_9H)).toEqual({ tipo: 'agendar', agendadoPara: SEXTA_9H })
  })

  it('o comparecimento passa o card ao CRC2 mesmo com outra consulta marcada', () => {
    expect(passoDoAviso('paciente_compareceu', QUINTA_10H, SEXTA_9H)).toEqual({ tipo: 'compareceu' })
  })
})

describe('as tentativas', () => {
  it('esperam 30 s, 2 min... até 12 h, e depois desistem', () => {
    const agora = new Date('2026-10-07T12:00:00Z')
    expect(proximaTentativa(1, agora)).toEqual(new Date('2026-10-07T12:00:30Z'))
    expect(proximaTentativa(2, agora)).toEqual(new Date('2026-10-07T12:02:00Z'))
    expect(proximaTentativa(8, agora)).toEqual(new Date('2026-10-08T00:00:00Z'))
    expect(proximaTentativa(9, agora)).toBeNull()
  })

  it('repetem o que passa sozinho e desistem do que uma regra recusou', () => {
    expect(vaiPassarSozinho(new ErroDoCrm(0, null, 'sem rede'))).toBe(true)
    expect(vaiPassarSozinho(new ErroDoCrm(502, null, 'fora do ar'))).toBe(true)
    expect(vaiPassarSozinho(new ErroDoCrm(429, 'MUITAS_TENTATIVAS', 'limite'))).toBe(true)
    expect(vaiPassarSozinho(new ErroDoCrm(401, 'CHAVE_INVALIDA', 'chave'))).toBe(true)
    expect(vaiPassarSozinho(new ErroDoCrm(403, 'CLINICA_FORA_DA_CHAVE', 'clínica'))).toBe(true)
    expect(vaiPassarSozinho(new Error('qualquer outra coisa'))).toBe(true)
    expect(vaiPassarSozinho(new ErroDoCrm(400, 'DADOS_INVALIDOS', 'telefone'))).toBe(false)
    expect(vaiPassarSozinho(new ErroDoCrm(404, 'ETAPA_NAO_ENCONTRADA', 'coluna'))).toBe(false)
  })

  it('reconhecem o card fechado e o card fora do alcance da agenda', () => {
    expect(cardFora(new ErroDoCrm(409, 'CARD_NAO_ESTA_ABERTO', ''))).toBe(true)
    expect(cardFora(new ErroDoCrm(404, 'CARD_NAO_ENCONTRADO', ''))).toBe(true)
    expect(nadaAFazer(new ErroDoCrm(400, 'MOVER_ENTRE_PAINEIS', ''))).toBe(true)
    expect(nadaAFazer(new ErroDoCrm(409, 'JA_ESTA_EM_OUTRO_PAINEL', ''))).toBe(true)
    expect(cardFora(new ErroDoCrm(409, 'CONTATO_JA_TEM_CARD_ABERTO', ''))).toBe(false)
    expect(nadaAFazer(new Error('x'))).toBe(false)
  })
})
