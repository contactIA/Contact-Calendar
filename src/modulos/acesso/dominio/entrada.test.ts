import { describe, expect, it } from 'vitest'
import { conferirEntrada, hostPermitido, lerHosts, temAlgumPapel } from './entrada'

const ids = { companyId: '58e1700e-84e1-4d41-aaa9-2918925a3cef', userId: 'c2535a86-c50b-4364-bdec-595b9962bac0' }
const hosts = ['app.fluxodonto.com']

describe('conferirEntrada', () => {
  it('aceita quem vem da plataforma', () => {
    expect(conferirEntrada({ ...ids, referer: 'https://app.fluxodonto.com/chat', destino: 'iframe' }, hosts)).toBeNull()
  })

  it('sem Referer, só dentro de um iframe', () => {
    expect(conferirEntrada({ ...ids, referer: null, destino: 'iframe' }, hosts)).toBeNull()
    expect(conferirEntrada({ ...ids, referer: null, destino: 'document' }, hosts)).toBe('fora_da_plataforma')
  })

  it('recusa Referer de outro site', () => {
    expect(conferirEntrada({ ...ids, referer: 'https://fluxodonto.com.golpe.io/', destino: 'iframe' }, hosts)).toBe(
      'fora_da_plataforma'
    )
  })

  it('marcador não trocado ou vazio não é id', () => {
    expect(conferirEntrada({ companyId: '{{companyId}}', userId: ids.userId, referer: null, destino: 'iframe' }, hosts)).toBe(
      'parametros_invalidos'
    )
    expect(conferirEntrada({ companyId: ids.companyId, userId: null, referer: null, destino: 'iframe' }, hosts)).toBe(
      'parametros_invalidos'
    )
  })

  it('sem lista de hosts (desenvolvimento), não confere a origem', () => {
    expect(conferirEntrada({ ...ids, referer: null, destino: 'document' }, [])).toBeNull()
  })
})

describe('hosts', () => {
  it('aceita subdomínio, não sufixo solto', () => {
    expect(hostPermitido('crm.app.fluxodonto.com', hosts)).toBe(true)
    expect(hostPermitido('xapp.fluxodonto.com', hosts)).toBe(false)
  })

  it('lê a lista do .env', () => {
    expect(lerHosts(' https://app.fluxodonto.com/ , Outro.com ,')).toEqual(['app.fluxodonto.com', 'outro.com'])
  })
})

describe('temAlgumPapel', () => {
  it('quem não é gestor, recepção nem dentista não entra', () => {
    expect(temAlgumPapel({ gestor: false, recepcao: false, dentista: false })).toBe(false)
    expect(temAlgumPapel({ gestor: false, recepcao: false, dentista: true })).toBe(true)
  })
})
