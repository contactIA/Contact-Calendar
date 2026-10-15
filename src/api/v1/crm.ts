import { createRoute, z } from '@hono/zod-openapi'
import { corpoJson, DataHora, ERROS_COMUNS, erros, json, ParametroId, serializar } from '../apoio'
import { exigirAcesso } from '../autenticacao'
import { novoRoteador } from '../roteador'
import { Consulta, LigacaoComOCrm, Vinda } from './esquemas'

// A ligação com o CRM (fase 7b), fora do /api/docs: quem chama é o CRM (os
// avisos) e a tela (a ligação, do gestor, e as vindas, da recepção).

const receberAviso = createRoute({
  method: 'post',
  path: '/crm/avisos',
  hide: true,
  tags: ['Sistema'],
  summary: 'Receber um aviso do CRM',
  description:
    'O webhook que a agenda cadastra no CRM ao ligar a clínica. A assinatura (`X-CRM-Assinatura`) é conferida com o segredo da clínica; o aviso repetido é aceito e ignorado.',
  responses: {
    200: json(z.object({ ok: z.literal(true), resultado: z.enum(['novo', 'repetido']) }), 'Recebido'),
    ...erros(400, 401, 404),
  },
})

const verLigacao = createRoute({
  method: 'get',
  path: '/crm/ligacao',
  hide: true,
  tags: ['Cadastros'],
  summary: 'A ligação com o CRM',
  description: 'Só o gestor, pela tela.',
  responses: { 200: json(LigacaoComOCrm, 'A ligação'), ...erros(401, 403) },
})

const ligar = createRoute({
  method: 'post',
  path: '/crm/ligacao',
  hide: true,
  tags: ['Cadastros'],
  summary: 'Ligar a clínica ao CRM',
  description: 'Só o gestor. Cadastra no CRM o webhook da clínica, e a agenda passa a avisar o CRM e a receber os avisos dele.',
  responses: { 200: json(LigacaoComOCrm, 'Ligada'), ...erros(401, 403, 404, 502, 503) },
})

const desligar = createRoute({
  method: 'delete',
  path: '/crm/ligacao',
  hide: true,
  tags: ['Cadastros'],
  summary: 'Desligar a clínica do CRM',
  description: 'Só o gestor. Apaga o webhook no CRM e para os avisos.',
  responses: { 200: json(LigacaoComOCrm, 'Desligada'), ...erros(401, 403, 404, 502) },
})

const unidadesDoCrm = createRoute({
  method: 'get',
  path: '/crm/unidades',
  hide: true,
  tags: ['Cadastros'],
  summary: 'As unidades da clínica no CRM',
  description: 'Só o gestor, para ligar cada unidade da agenda à do CRM (`crmUnidadeId`).',
  responses: { 200: json(z.object({ unidades: z.array(z.object({ id: z.string(), nome: z.string(), ativa: z.boolean() })) }), 'As unidades do CRM'), ...erros(401, 403, 502, 503) },
})

const procedimentoDasVindas = createRoute({
  method: 'put',
  path: '/crm/procedimento-das-vindas',
  hide: true,
  tags: ['Cadastros'],
  summary: 'O procedimento das consultas vindas do CRM',
  description: 'Só o gestor. Sem ele (`null`), nenhuma consulta que o CRM marca fora da agenda entra sozinha.',
  request: corpoJson(z.object({ procedimentoId: z.uuid().nullable() })),
  responses: { 204: { description: 'Gravado' }, ...erros(...ERROS_COMUNS) },
})

const listarVindas = createRoute({
  method: 'get',
  path: '/vindas',
  hide: true,
  tags: ['Consultas'],
  summary: 'As consultas do CRM que esperam a recepção',
  description: 'O que o CRM marcou fora da agenda e não entrou sozinho, pelo horário.',
  responses: { 200: json(z.object({ vindas: z.array(Vinda) }), 'As vindas pendentes'), ...erros(401, 403) },
})

const encaixar = createRoute({
  method: 'post',
  path: '/vindas/{id}/encaixar',
  hide: true,
  tags: ['Consultas'],
  summary: 'Encaixar uma consulta vinda do CRM',
  description:
    'A recepção escolhe o profissional, o procedimento e, se quiser, a cadeira e outro horário. Na remarcação, a consulta ligada ao card muda. O dentista da Clinicorp fica ligado ao profissional escolhido para as próximas.',
  request: {
    params: ParametroId,
    ...corpoJson(
      z.object({
        profissionalId: z.uuid(),
        procedimentoId: z.uuid().optional().openapi({ description: 'Para marcar; na remarcação, a consulta continua com o dela' }),
        cadeiraId: z.uuid().optional(),
        inicio: DataHora.optional(),
        duracaoMinutos: z.number().int().min(5).max(480).optional(),
        nome: z.string().trim().min(2).max(200).optional(),
      })
    ),
  },
  responses: { 200: json(Consulta, 'A consulta'), ...erros(...ERROS_COMUNS, 409) },
})

const descartar = createRoute({
  method: 'post',
  path: '/vindas/{id}/descartar',
  hide: true,
  tags: ['Consultas'],
  summary: 'Descartar uma consulta vinda do CRM',
  description: 'Sai da lista sem virar consulta.',
  request: { params: ParametroId },
  responses: { 204: { description: 'Descartada' }, ...erros(...ERROS_COMUNS) },
})

const conversa = createRoute({
  method: 'get',
  path: '/consultas/{id}/conversa',
  hide: true,
  tags: ['Consultas'],
  summary: 'A conversa do paciente na plataforma',
  description: 'O endereço da conversa do paciente da consulta, que o CRM acha pelo card. Sem conversa, 404 com o código `SEM_CONVERSA`.',
  request: { params: ParametroId },
  responses: { 200: json(z.object({ url: z.string() }), 'A conversa'), ...erros(...ERROS_COMUNS, 502, 503) },
})

const r = novoRoteador()
r.use('/crm/ligacao', exigirAcesso)
r.use('/crm/procedimento-das-vindas', exigirAcesso)
r.use('/crm/unidades', exigirAcesso)
r.use('/consultas/:id/conversa', exigirAcesso)
r.use('/vindas', exigirAcesso)
r.use('/vindas/*', exigirAcesso)

export const rotasDoCrm = r
  .openapi(receberAviso, async (c) => {
    const resultado = await c.var.casos.crm.receberAviso(await c.req.text(), c.req.header('x-crm-assinatura') ?? null)
    return c.json({ ok: true as const, resultado }, 200)
  })
  .openapi(verLigacao, async (c) => c.json(await c.var.casos.crm.estadoDaLigacao(c.var.acesso), 200))
  .openapi(ligar, async (c) => c.json(await c.var.casos.crm.ligar(c.var.acesso), 200))
  .openapi(desligar, async (c) => c.json(await c.var.casos.crm.desligar(c.var.acesso), 200))
  .openapi(unidadesDoCrm, async (c) => c.json({ unidades: await c.var.casos.crm.unidadesDoCrm(c.var.acesso) }, 200))
  .openapi(procedimentoDasVindas, async (c) => {
    await c.var.casos.cadastros.definirProcedimentoDasVindas(c.var.acesso, c.req.valid('json').procedimentoId)
    return c.body(null, 204)
  })
  .openapi(conversa, async (c) => c.json(await c.var.casos.crm.conversaDaConsulta(c.var.acesso, c.req.valid('param').id), 200))
  .openapi(listarVindas, async (c) => c.json(serializar({ vindas: await c.var.casos.vindas.listar(c.var.acesso) }), 200))
  .openapi(encaixar, async (c) => {
    const { inicio, ...pedido } = c.req.valid('json')
    const consulta = await c.var.casos.vindas.encaixar(c.var.acesso, c.req.valid('param').id, { ...pedido, inicio: inicio ? new Date(inicio) : undefined })
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, consulta.id)), 200)
  })
  .openapi(descartar, async (c) => {
    await c.var.casos.vindas.descartar(c.var.acesso, c.req.valid('param').id)
    return c.body(null, 204)
  })
