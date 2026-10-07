import { describe, expect, it } from 'vitest'
import { atorDo, cuidaDaAgenda, exigirQueCuidaDaAgenda, profissionalVisivel, unidadesVisiveis, type Acesso, type Papeis } from './acesso'

const usuario = (papeis: Partial<Papeis>, extra: { profissionalId?: string | null; unidades?: string[] } = {}): Acesso => ({
  tipo: 'usuario',
  clinicaId: 'c',
  usuarioId: 'u',
  nome: 'Pessoa',
  papeis: { gestor: false, recepcao: false, dentista: false, ...papeis },
  profissionalId: extra.profissionalId ?? null,
  unidades: extra.unidades,
})

describe('acesso', () => {
  it('a recepção e o gestor cuidam da agenda; o dentista sozinho, não', () => {
    expect(cuidaDaAgenda(usuario({ recepcao: true }))).toBe(true)
    expect(cuidaDaAgenda(usuario({ gestor: true }))).toBe(true)
    expect(cuidaDaAgenda(usuario({ dentista: true }))).toBe(false)
    expect(cuidaDaAgenda(usuario({ dentista: true, recepcao: true }))).toBe(true)
    expect(() => exigirQueCuidaDaAgenda(usuario({ dentista: true }))).toThrow(expect.objectContaining({ codigo: 'SO_RECEPCAO' }))
  })

  it('a chave só de leitura não grava', () => {
    const chave: Acesso = { tipo: 'ia', clinicaId: 'c', chaveId: 'k', nome: 'IA', podeEscrever: false }
    expect(() => exigirQueCuidaDaAgenda(chave)).toThrow(expect.objectContaining({ codigo: 'CHAVE_SO_LEITURA' }))
    expect(() => exigirQueCuidaDaAgenda({ ...chave, podeEscrever: true })).not.toThrow()
    expect(atorDo(chave)).toEqual({ tipo: 'ia', id: 'k' })
  })

  it('o dentista vê só a agenda dele; quem cuida da agenda vê todas', () => {
    expect(profissionalVisivel(usuario({ dentista: true }, { profissionalId: 'p1' }))).toBe('p1')
    expect(profissionalVisivel(usuario({ dentista: true }))).toBeNull()
    expect(profissionalVisivel(usuario({ recepcao: true }))).toBeUndefined()
  })

  it('as unidades vinculadas limitam, menos para o gestor', () => {
    expect(unidadesVisiveis(usuario({ recepcao: true }, { unidades: ['a'] }))).toEqual(['a'])
    expect(unidadesVisiveis(usuario({ gestor: true }, { unidades: ['a'] }))).toBeNull()
    expect(unidadesVisiveis(usuario({ recepcao: true }))).toBeNull()
  })
})
