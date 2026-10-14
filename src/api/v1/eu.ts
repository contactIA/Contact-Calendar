import { createRoute, z } from '@hono/zod-openapi'
import { CADENCIAS_DA_GRADE } from '@/compartilhado/vocabulario'
import { corpoJson, erros, json } from '../apoio'
import { exigirAcesso } from '../autenticacao'
import { novoRoteador } from '../roteador'
import { Eu } from './esquemas'

// Quem está usando a tela. A página pede isto ao abrir, com o token da sessão que
// recebeu pelo item de menu: os papéis decidem o que ela mostra, e o fuso e a
// cadência da clínica montam a grade. A chave da API não tem "eu".

const verEu = createRoute({
  method: 'get',
  path: '/eu',
  tags: ['Sistema'],
  summary: 'Quem está usando a tela',
  description: 'Só com a sessão da tela (cabeçalho `X-Agenda-Sessao`), que a página recebe ao abrir pelo item de menu da plataforma.',
  responses: { 200: json(Eu, 'O usuário e a clínica'), ...erros(401, 403) },
})

const alterarClinica = createRoute({
  method: 'patch',
  path: '/clinica',
  tags: ['Cadastros'],
  summary: 'Alterar a cadência da grade',
  description: `Só o gestor, pela tela. De quanto em quanto tempo a agenda oferece um início: ${CADENCIAS_DA_GRADE.join(', ')} minutos. A duração continua a do procedimento.`,
  request: corpoJson(z.object({ cadenciaMinutos: z.number().int() }), { cadenciaMinutos: 15 }),
  responses: { 200: json(Eu, 'O usuário e a clínica, com a cadência nova'), ...erros(400, 401, 403) },
})

const r = novoRoteador()
r.use('/eu', exigirAcesso)
r.use('/clinica', exigirAcesso)

export const rotasDoEu = r
  .openapi(verEu, async (c) => c.json(await c.var.casos.acesso.eu(c.var.acesso), 200))
  .openapi(alterarClinica, async (c) => c.json(await c.var.casos.acesso.alterarCadencia(c.var.acesso, c.req.valid('json').cadenciaMinutos), 200))
