import { createRoute, z } from '@hono/zod-openapi'
import { corpoJson, DataHora, ERROS_COMUNS, erros, json, SEGURANCA, serializar } from '../apoio'
import { exigirAcesso } from '../autenticacao'
import { novoRoteador } from '../roteador'
import { Consulta, HorarioLivre } from './esquemas'

// As habilidades do agente de IA: ele conhece o paciente pelo telefone da
// conversa, não pelo id. Os casos de uso são os mesmos da tela; muda só como o
// paciente e a consulta são achados.
//
// O telefone pode ser de mais de uma pessoa (a mãe marca para o filho). Quando há
// dúvida, a resposta é 409 PACIENTE_AMBIGUO, com os nomes: o agente pergunta e
// manda de novo com o `nome`.

const tags = ['Agente de IA']
const Telefone = z.string().min(8).max(30).openapi({ description: 'O telefone da conversa, com DDD', example: '5562999990000' })
const Nome = z.string().max(200).optional().openapi({ description: 'O nome do paciente: desempata quando a família usa o mesmo telefone', example: 'Maria Souza' })
const ConsultaId = z.uuid().optional().openapi({ description: 'Vazio: a próxima consulta marcada do paciente' })

const Recomendacao = z.object({
  profissional: z.object({ id: z.uuid(), nome: z.string() }),
  motivo: z.string().openapi({ example: 'Já atendeu o paciente' }),
  horarios: z.array(HorarioLivre),
})

const disponibilidade = createRoute({
  method: 'get',
  path: '/agente/disponibilidade',
  tags,
  summary: 'Profissional recomendado e horários do dia',
  description: [
    'O profissional recomendado e as alternativas, cada um com os horários livres do dia. Só entra quem tem horário.',
    '',
    'A ordem: quem já atendeu o paciente, depois quem tem menos consultas no dia, depois a prioridade na unidade.',
  ].join('\n'),
  security: SEGURANCA,
  request: {
    query: z.object({
      unidadeId: z.uuid(),
      procedimentoId: z.uuid(),
      data: z.iso.date().openapi({ description: 'O dia, no fuso da clínica', example: '2026-10-08' }),
      telefone: Telefone.optional(),
      nome: Nome,
      quantos: z.coerce.number().int().min(1).max(5).default(2).openapi({ description: 'Quantos profissionais, com o recomendado' }),
    }),
  },
  responses: {
    200: json(
      z.object({
        paciente: z.object({ id: z.uuid(), nome: z.string() }).nullable().openapi({ description: 'O paciente do telefone, quando achado' }),
        recomendado: Recomendacao.nullable(),
        alternativas: z.array(Recomendacao),
      }),
      'A recomendação'
    ),
    ...erros(...ERROS_COMUNS),
  },
})

const agendar = createRoute({
  method: 'post',
  path: '/agente/agendar',
  tags,
  summary: 'Agendar para o paciente do telefone',
  description:
    'Acha o paciente pelo telefone (e o nome) ou o cadastra, e marca. Só no futuro e dentro do expediente. Paciente novo precisa do `nome`.',
  security: SEGURANCA,
  request: corpoJson(
    z.object({
      telefone: Telefone,
      nome: Nome,
      unidadeId: z.uuid(),
      profissionalId: z.uuid(),
      procedimentoId: z.uuid(),
      inicio: DataHora,
      duracaoMinutos: z.number().int().min(5).max(480).optional(),
      cadeiraId: z.uuid().optional(),
      observacoes: z.string().max(2000).nullable().optional(),
    }),
    {
      telefone: '5562999990000',
      nome: 'Maria Souza',
      unidadeId: '3f5c9a1e-8d2b-4c1a-9e7f-2b6d4a8c0e11',
      profissionalId: '8b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
      procedimentoId: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
      inicio: '2026-10-08T10:00:00-03:00',
    }
  ),
  responses: { 201: json(Consulta, 'A consulta marcada'), ...erros(...ERROS_COMUNS, 409) },
})

const remarcar = createRoute({
  method: 'post',
  path: '/agente/remarcar',
  tags,
  summary: 'Remarcar a consulta do paciente do telefone',
  description: 'Sem `consultaId`, a próxima consulta marcada. Só no futuro e dentro do expediente.',
  security: SEGURANCA,
  request: corpoJson(
    z.object({ telefone: Telefone, nome: Nome, consultaId: ConsultaId, inicio: DataHora, profissionalId: z.uuid().optional(), cadeiraId: z.uuid().optional() }),
    { telefone: '5562999990000', inicio: '2026-10-09T15:00:00-03:00' }
  ),
  responses: { 200: json(Consulta, 'A consulta no horário novo'), ...erros(...ERROS_COMUNS, 409) },
})

const confirmar = createRoute({
  method: 'post',
  path: '/agente/confirmar',
  tags,
  summary: 'Confirmar a consulta do paciente do telefone',
  description: 'Para o paciente que responde ao lembrete. Sem `consultaId`, a próxima consulta marcada.',
  security: SEGURANCA,
  request: corpoJson(z.object({ telefone: Telefone, nome: Nome, consultaId: ConsultaId }), { telefone: '5562999990000' }),
  responses: { 200: json(Consulta, 'A consulta confirmada'), ...erros(...ERROS_COMUNS, 409) },
})

const cancelar = createRoute({
  method: 'post',
  path: '/agente/cancelar',
  tags,
  summary: 'Cancelar a consulta do paciente do telefone',
  description: 'Sem `consultaId`, a próxima consulta marcada.',
  security: SEGURANCA,
  request: corpoJson(z.object({ telefone: Telefone, nome: Nome, consultaId: ConsultaId, motivo: z.string().max(500).optional() }), {
    telefone: '5562999990000',
    motivo: 'Viagem',
  }),
  responses: { 200: json(Consulta, 'A consulta cancelada'), ...erros(...ERROS_COMUNS, 409) },
})

const consultar = createRoute({
  method: 'get',
  path: '/agente/consulta',
  tags,
  summary: 'A próxima consulta do paciente do telefone',
  security: SEGURANCA,
  request: { query: z.object({ telefone: Telefone, nome: Nome }) },
  responses: { 200: json(z.object({ consulta: Consulta.nullable() }), 'A próxima agendada ou confirmada; `null` se não houver'), ...erros(...ERROS_COMUNS, 409) },
})

const r = novoRoteador()
r.use('/agente/*', exigirAcesso)

export const rotasDoAgente = r
  .openapi(disponibilidade, async (c) => {
    return c.json(serializar(await c.var.casos.agenda.recomendar(c.var.acesso, c.req.valid('query'))), 200)
  })
  .openapi(agendar, async (c) => {
    const { telefone, nome, inicio, ...pedido } = c.req.valid('json')
    const { consulta } = await c.var.casos.agenda.agendar(c.var.acesso, { ...pedido, inicio: new Date(inicio), paciente: { nome: nome ?? '', telefone } })
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, consulta.id)), 201)
  })
  .openapi(remarcar, async (c) => {
    const { inicio, ...pedido } = c.req.valid('json')
    const consulta = await c.var.casos.agenda.remarcarDoPaciente(c.var.acesso, { ...pedido, inicio: new Date(inicio) })
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, consulta.id)), 200)
  })
  .openapi(confirmar, async (c) => {
    const consulta = await c.var.casos.agenda.confirmarDoPaciente(c.var.acesso, c.req.valid('json'))
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, consulta.id)), 200)
  })
  .openapi(cancelar, async (c) => {
    const consulta = await c.var.casos.agenda.cancelarDoPaciente(c.var.acesso, c.req.valid('json'))
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, consulta.id)), 200)
  })
  .openapi(consultar, async (c) => {
    return c.json(serializar({ consulta: await c.var.casos.agenda.proximaConsulta(c.var.acesso, c.req.valid('query')) }), 200)
  })
