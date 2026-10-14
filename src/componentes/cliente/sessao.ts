'use client'

import { useSyncExternalStore } from 'react'

// O token da sessão da tela, como no CRM. Fica na memória da página e, para
// sobreviver a um recarregar dentro do iframe, no sessionStorage da aba. Não é
// cookie: dentro do iframe da plataforma o cookie de terceiro é bloqueado ou
// particionado, conforme o navegador.
//
// O sessionStorage pode estar bloqueado (modo privado, política do navegador):
// cada acesso tem try/catch e a memória segura o resto.

const CHAVE_DA_TELA = 'agenda_sessao'

let naMemoria: string | null = null

export function tokenDaTela(): string | null {
  if (naMemoria) return naMemoria
  try {
    return window.sessionStorage.getItem(CHAVE_DA_TELA)
  } catch {
    return null
  }
}

export function guardarTokenDaTela(token: string | null) {
  naMemoria = token
  try {
    if (token) window.sessionStorage.setItem(CHAVE_DA_TELA, token)
    else window.sessionStorage.removeItem(CHAVE_DA_TELA)
  } catch {
    // Sem armazenamento: fica só na memória desta página.
  }
}

const semAvisos = () => () => undefined

/**
 * Se a aba tem o token. No servidor e na hidratação ainda não dá para saber
 * (o sessionStorage é do navegador): null, e a tela mostra "abrindo".
 */
export const useTemTokenDaTela = (): boolean | null => useSyncExternalStore(semAvisos, () => Boolean(tokenDaTela()), () => null)
