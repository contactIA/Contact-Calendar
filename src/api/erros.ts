import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ErroDeDominio, type TipoDeErro } from '@/compartilhado/erros'

// Tradução de erro para resposta HTTP, num lugar só.
//
// Erro de domínio sobe com a frase e o código dele: são textos escritos para quem
// usa a API. Qualquer outra coisa vira 500 genérico, com o detalhe só no log: a
// mensagem de uma exceção inesperada pode conter credencial, SQL ou dado de
// paciente, e nada disso tem por que sair do servidor.

const STATUS: Record<TipoDeErro, 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503> = {
  invalido: 400,
  nao_autenticado: 401,
  proibido: 403,
  nao_encontrado: 404,
  conflito: 409,
  muitas_tentativas: 429,
  externo: 502,
  indisponivel: 503,
}

export function tratarErro(erro: Error, c: Context) {
  if (erro instanceof ErroDeDominio) {
    return c.json({ erro: erro.message, codigo: erro.codigo }, STATUS[erro.tipo])
  }
  if (erro instanceof HTTPException) return erro.getResponse()

  console.error('[api]', erro)
  return c.json({ erro: 'Não foi possível completar a operação', codigo: 'ERRO_INTERNO' }, 500)
}
