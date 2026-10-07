import { createRoute, z } from '@hono/zod-openapi'
import { novoRoteador } from '../roteador'
import { VERSAO_DA_API } from '../versao'

const Saude = z
  .object({
    ok: z.boolean(),
    versao: z.string().openapi({ example: VERSAO_DA_API }),
    banco: z.enum(['ok', 'fora']).openapi({ description: 'Se o banco responde' }),
  })
  .openapi('Saude')

const verSaude = createRoute({
  method: 'get',
  path: '/saude',
  tags: ['Sistema'],
  summary: 'Confere se a API e o banco estão no ar',
  description: 'Não exige chave. Serve para monitoramento e para o deploy saber que o container novo está pronto.',
  responses: {
    200: { description: 'A API e o banco estão no ar', content: { 'application/json': { schema: Saude } } },
    503: { description: 'A API está no ar, mas o banco não responde', content: { 'application/json': { schema: Saude } } },
  },
})

export const rotasDoSistema = novoRoteador().openapi(verSaude, async (c) => {
  let banco = false
  try {
    banco = await c.var.casos.sistema.bancoResponde()
  } catch {
    // Sem DATABASE_URL, os casos de uso nem montam: o banco conta como fora.
  }
  return banco
    ? c.json({ ok: true, versao: VERSAO_DA_API, banco: 'ok' as const }, 200)
    : c.json({ ok: false, versao: VERSAO_DA_API, banco: 'fora' as const }, 503)
})
