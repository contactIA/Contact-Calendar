'use client'

import { tokenDaTela } from './sessao'

// O cliente da API para a tela. A tela usa a mesma API das integrações (/api/v1),
// com o token da sessão no cabeçalho X-Agenda-Sessao.

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhes?: { campo: string; mensagem: string }[]
  ) {
    super(mensagem)
    this.name = 'ErroDaApi'
  }
}

/** Avisa a tela quando a sessão acaba, para ela mostrar como entrar de novo. */
export const EVENTO_SESSAO_EXPIRADA = 'agenda:sessao-expirada'

function lerJson(texto: string): Record<string, unknown> | null {
  if (!texto) return {}
  try {
    return JSON.parse(texto) as Record<string, unknown>
  } catch {
    return null
  }
}

type Corpo = Record<string, unknown> | unknown[]

async function pedir<T>(metodo: string, caminho: string, corpo?: Corpo): Promise<T> {
  const token = tokenDaTela()
  let resposta: Response
  try {
    resposta = await fetch(`/api/v1${caminho}`, {
      method: metodo,
      headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Agenda-Sessao': token } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: 'no-store',
    })
  } catch {
    throw new ErroDaApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor. Confira a internet e tente de novo.')
  }
  if (resposta.status === 204) return undefined as T
  const dados = lerJson(await resposta.text())
  if (dados === null) {
    // Não veio da API: uma página de erro do servidor na frente dela, no meio de um deploy.
    throw new ErroDaApi(resposta.status, 'RESPOSTA_INVALIDA', 'O servidor não respondeu direito. Tente de novo em instantes.')
  }
  if (!resposta.ok) {
    if (resposta.status === 401 && token) window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA))
    throw new ErroDaApi(
      resposta.status,
      String(dados.codigo ?? 'ERRO'),
      String(dados.erro ?? 'Não foi possível completar a operação'),
      dados.detalhes as ErroDaApi['detalhes']
    )
  }
  return dados as T
}

export const api = {
  get: <T>(caminho: string) => pedir<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: Corpo) => pedir<T>('POST', caminho, corpo ?? {}),
  put: <T>(caminho: string, corpo: Corpo) => pedir<T>('PUT', caminho, corpo),
  patch: <T>(caminho: string, corpo: Corpo) => pedir<T>('PATCH', caminho, corpo),
  delete: <T = void>(caminho: string) => pedir<T>('DELETE', caminho),
}

/** A frase para mostrar de um erro qualquer. */
export function fraseDoErro(erro: unknown): string {
  if (erro instanceof ErroDaApi) return erro.message
  return 'Algo deu errado. Tente de novo.'
}
