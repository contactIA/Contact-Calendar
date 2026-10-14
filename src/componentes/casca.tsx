'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { EuJson } from '@/api/v1/esquemas'
import { Abrindo, AvisoDeTela } from './aviso-de-tela'
import { api, ErroDaApi, EVENTO_SESSAO_EXPIRADA } from './cliente/api'
import { useTemTokenDaTela } from './cliente/sessao'

// A casca de toda página da agenda: confere a sessão desta aba, pede o /eu e
// entrega às telas quem está usando (os papéis) e a clínica (o fuso e a cadência
// da grade). Sem sessão, ou com ela vencida, mostra como entrar de novo.

const ContextoDoEu = createContext<EuJson | null>(null)

/** Quem está usando a tela. Só dentro da casca. */
export function useEu(): EuJson {
  const eu = useContext(ContextoDoEu)
  if (!eu) throw new Error('useEu fora da casca da agenda')
  return eu
}

export function Casca({ children }: { children: ReactNode }) {
  const temToken = useTemTokenDaTela()
  const [expirou, setExpirou] = useState(false)
  const [eu, setEu] = useState<EuJson | null>(null)
  const [erro, setErro] = useState<unknown>(null)

  useEffect(() => {
    const aoExpirar = () => setExpirou(true)
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar)
  }, [])

  useEffect(() => {
    if (!temToken) return
    let cancelado = false
    api
      .get<EuJson>('/eu')
      .then((dados) => !cancelado && setEu(dados))
      .catch((e: unknown) => !cancelado && setErro(e))
    return () => {
      cancelado = true
    }
  }, [temToken])

  if (temToken === false || expirou || (erro instanceof ErroDaApi && erro.status === 401)) {
    return (
      <AvisoDeTela titulo={expirou ? 'Sua sessão acabou' : 'Abra a agenda pelo menu da plataforma'}>
        <p>
          {expirou
            ? 'Por segurança, a sessão dura algumas horas. Abra a agenda de novo pelo item no menu da plataforma.'
            : 'A agenda abre de dentro da plataforma de atendimento, já com o seu usuário. Use o item da agenda no menu.'}
        </p>
      </AvisoDeTela>
    )
  }
  if (erro) {
    return (
      <AvisoDeTela titulo="Não foi possível abrir a agenda">
        <p>{erro instanceof Error ? erro.message : 'Tente de novo em instantes.'}</p>
      </AvisoDeTela>
    )
  }
  if (!eu) return <Abrindo />
  return <ContextoDoEu.Provider value={eu}>{children}</ContextoDoEu.Provider>
}
