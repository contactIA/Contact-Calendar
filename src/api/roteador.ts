import { OpenAPIHono } from '@hono/zod-openapi'
import type { Ambiente } from './ambiente'

// Todo roteador da API nasce aqui, para todos responderem do mesmo jeito quando a
// requisição não passa na validação dos esquemas.
//
// O esquema de cada rota (zod) faz duas coisas ao mesmo tempo: valida a
// requisição e gera a documentação OpenAPI. Rota sem esquema não entra.

export function novoRoteador() {
  return new OpenAPIHono<Ambiente>({
    defaultHook: (resultado, c) => {
      if (!resultado.success) {
        return c.json(
          {
            erro: 'Requisição inválida',
            codigo: 'REQUISICAO_INVALIDA',
            detalhes: resultado.error.issues.map((problema) => ({
              campo: problema.path.join('.'),
              mensagem: problema.message,
            })),
          },
          400
        )
      }
    },
  })
}
