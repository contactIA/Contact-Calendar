import { createRoute, z } from '@hono/zod-openapi'
import { corpoJson, DataHora, ERROS_COMUNS, erros, json, ParametroId, SEGURANCA, serializar } from '../apoio'
import { exigirAcesso } from '../autenticacao'
import { novoRoteador } from '../roteador'
import { Consulta, HorarioLivre, Paciente, PacienteEncontrado, StatusDaConsulta } from './esquemas'

// A agenda: horários livres, consultas e pacientes. É o que a tela faz, e o que
// uma integração faz pelo id da consulta. O agente de IA, que conhece o paciente
// pelo telefone, tem as rotas dele em ./agente.ts; as regras são as mesmas.

const Data = z.iso.date().openapi({ description: 'O dia, no fuso da clínica', example: '2026-10-08' })
const Versao = z.number().int().positive().optional().openapi({
  description: 'A versão da consulta que você leu. Se outra pessoa mudou a consulta depois, a resposta é 409.',
})
const Telefone = z.string().min(8).max(30).openapi({ description: 'Com DDD; o país é o Brasil quando não vem', example: '(62) 99999-0000' })

const DadosDoPaciente = z.object({
  nome: z.string().min(1).max(200).openapi({ example: 'Maria Souza' }),
  telefone: Telefone.nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  nascimento: z.iso.date().nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
})

/** O paciente sem o que é da agenda por dentro. */
const paraPaciente = (p: { id: string; nome: string; telefone: string | null; email: string | null; nascimento: string | null; observacoes: string | null }) => ({
  id: p.id,
  nome: p.nome,
  telefone: p.telefone,
  email: p.email,
  nascimento: p.nascimento,
  observacoes: p.observacoes,
})

const horariosLivres = createRoute({
  method: 'get',
  path: '/horarios-livres',
  tags: ['Horários'],
  summary: 'Os horários livres de um dia',
  description:
    'Cada profissional ativo da unidade que faz o procedimento, com os inícios livres no expediente dele, já sem as consultas, os bloqueios e as cadeiras ocupadas. Com `pacienteId`, tira também os horários em que o paciente já tem consulta.',
  security: SEGURANCA,
  request: {
    query: z.object({
      unidadeId: z.uuid(),
      procedimentoId: z.uuid(),
      data: Data,
      profissionalId: z.uuid().optional(),
      pacienteId: z.uuid().optional(),
      duracaoMinutos: z.coerce.number().int().min(5).max(480).optional().openapi({ description: 'Vazio: a duração do procedimento' }),
    }),
  },
  responses: {
    200: json(z.object({ profissionais: z.array(z.object({ profissional: z.object({ id: z.uuid(), nome: z.string() }), horarios: z.array(HorarioLivre) })) }), 'Os horários de cada profissional'),
    ...erros(...ERROS_COMUNS),
  },
})

const agendaDoPeriodo = createRoute({
  method: 'get',
  path: '/consultas',
  tags: ['Consultas'],
  summary: 'As consultas de um período',
  description: 'De um dia a seis semanas, todas as situações. O dentista vê só as dele; quem tem unidades vinculadas, só as delas.',
  security: SEGURANCA,
  request: {
    query: z.object({ de: DataHora, ate: DataHora, unidadeId: z.uuid().optional(), profissionalId: z.uuid().optional() }),
  },
  responses: { 200: json(z.object({ consultas: z.array(Consulta) }), 'As consultas, por início'), ...erros(...ERROS_COMUNS) },
})

const verConsulta = createRoute({
  method: 'get',
  path: '/consultas/{id}',
  tags: ['Consultas'],
  summary: 'Uma consulta',
  security: SEGURANCA,
  request: { params: ParametroId },
  responses: { 200: json(Consulta, 'A consulta'), ...erros(...ERROS_COMUNS) },
})

const agendar = createRoute({
  method: 'post',
  path: '/consultas',
  tags: ['Consultas'],
  summary: 'Agendar',
  description: [
    'Marca a consulta e avisa o CRM e a plataforma de mensagens, se a clínica configurou.',
    '',
    '- **O paciente** vem pelo `id`, ou pelo nome e o telefone: se já há um paciente com o telefone e o nome bate, é ele; senão, o paciente é cadastrado. Vários pacientes podem ter o mesmo telefone (a família).',
    '- **A cadeira**, se não vier, é a primeira livre da unidade.',
    '- **A chave da API** só marca no futuro e dentro do expediente. A recepção pode encaixar.',
  ].join('\n'),
  security: SEGURANCA,
  request: corpoJson(
    z.object({
      unidadeId: z.uuid(),
      profissionalId: z.uuid(),
      procedimentoId: z.uuid(),
      inicio: DataHora,
      duracaoMinutos: z.number().int().min(5).max(480).optional().openapi({ description: 'Vazio: a duração do procedimento' }),
      cadeiraId: z.uuid().optional(),
      observacoes: z.string().max(2000).nullable().optional(),
      paciente: z.union([z.object({ id: z.uuid() }), DadosDoPaciente.extend({ telefone: Telefone })]),
    }),
    {
      unidadeId: '3f5c9a1e-8d2b-4c1a-9e7f-2b6d4a8c0e11',
      profissionalId: '8b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
      procedimentoId: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
      inicio: '2026-10-08T10:00:00-03:00',
      paciente: { nome: 'Maria Souza', telefone: '(62) 99999-0000' },
    }
  ),
  responses: { 201: json(Consulta, 'A consulta marcada'), ...erros(...ERROS_COMUNS, 409) },
})

const remarcar = createRoute({
  method: 'post',
  path: '/consultas/{id}/remarcar',
  tags: ['Consultas'],
  summary: 'Remarcar',
  description:
    'Muda o horário da consulta agendada ou confirmada e, se pedir, o profissional ou a cadeira. Ela volta para agendada: a confirmação valia para o horário antigo. A cancelada e a falta não se remarcam: marque outra.',
  security: SEGURANCA,
  request: {
    params: ParametroId,
    ...corpoJson(
      z.object({
        inicio: DataHora,
        duracaoMinutos: z.number().int().min(5).max(480).optional().openapi({ description: 'Vazio: a mesma de antes' }),
        profissionalId: z.uuid().optional(),
        cadeiraId: z.uuid().optional(),
        versao: Versao,
      }),
      { inicio: '2026-10-09T15:00:00-03:00' }
    ),
  },
  responses: { 200: json(Consulta, 'A consulta no horário novo'), ...erros(...ERROS_COMUNS, 409) },
})

const mudarStatus = createRoute({
  method: 'post',
  path: '/consultas/{id}/status',
  tags: ['Consultas'],
  summary: 'Confirmar, cancelar, marcar chegada, falta ou conclusão',
  description: [
    'Quem pode cada passo:',
    '',
    '- **recepção e gestor:** todos;',
    '- **dentista:** chegada (`em_atendimento`) e conclusão, só nas consultas dele;',
    '- **chave da API:** confirmar e cancelar.',
  ].join('\n'),
  security: SEGURANCA,
  request: {
    params: ParametroId,
    ...corpoJson(
      z.object({ status: StatusDaConsulta, motivo: z.string().max(500).nullable().optional().openapi({ description: 'O motivo do cancelamento' }), versao: Versao }),
      { status: 'confirmada' }
    ),
  },
  responses: { 200: json(Consulta, 'A consulta com a situação nova'), ...erros(...ERROS_COMUNS, 409) },
})

const buscarPacientes = createRoute({
  method: 'get',
  path: '/pacientes',
  tags: ['Pacientes'],
  summary: 'Buscar pacientes',
  description: 'Pelo nome, sem diferença de acento nem de maiúscula, ou pelos dígitos do telefone. Até 20, por nome.',
  security: SEGURANCA,
  request: { query: z.object({ busca: z.string().max(200).openapi({ example: 'maria' }) }) },
  responses: { 200: json(z.object({ pacientes: z.array(PacienteEncontrado) }), 'Os pacientes encontrados'), ...erros(...ERROS_COMUNS) },
})

const criarPaciente = createRoute({
  method: 'post',
  path: '/pacientes',
  tags: ['Pacientes'],
  summary: 'Cadastrar paciente',
  description: 'O mesmo nome no mesmo telefone é recusado (409). Outro nome no mesmo telefone é outra pessoa da família.',
  security: SEGURANCA,
  request: corpoJson(DadosDoPaciente, { nome: 'Maria Souza', telefone: '(62) 99999-0000' }),
  responses: { 201: json(Paciente, 'O paciente cadastrado'), ...erros(...ERROS_COMUNS, 409) },
})

const alterarPaciente = createRoute({
  method: 'patch',
  path: '/pacientes/{id}',
  tags: ['Pacientes'],
  summary: 'Alterar paciente',
  description: 'Só os campos que vierem mudam. `null` apaga o campo.',
  security: SEGURANCA,
  request: { params: ParametroId, ...corpoJson(DadosDoPaciente.partial(), { email: 'maria@exemplo.com' }) },
  responses: { 200: json(Paciente, 'O paciente alterado'), ...erros(...ERROS_COMUNS) },
})

const verPaciente = createRoute({
  method: 'get',
  path: '/pacientes/{id}',
  tags: ['Pacientes'],
  summary: 'O paciente e as consultas dele',
  description: 'O cadastro, todas as consultas (da mais recente para a mais antiga) e a última visita concluída.',
  security: SEGURANCA,
  request: { params: ParametroId },
  responses: {
    200: json(z.object({ paciente: Paciente, consultas: z.array(Consulta), ultimaVisita: Consulta.nullable() }), 'O paciente'),
    ...erros(...ERROS_COMUNS),
  },
})

const proximaDoPaciente = createRoute({
  method: 'get',
  path: '/pacientes/{id}/proxima-consulta',
  tags: ['Pacientes'],
  summary: 'A próxima consulta marcada do paciente',
  security: SEGURANCA,
  request: { params: ParametroId },
  responses: { 200: json(z.object({ consulta: Consulta.nullable() }), 'A próxima agendada ou confirmada; `null` se não houver'), ...erros(...ERROS_COMUNS) },
})

const r = novoRoteador()
r.use('/horarios-livres', exigirAcesso)
r.use('/consultas', exigirAcesso)
r.use('/consultas/*', exigirAcesso)
r.use('/pacientes', exigirAcesso)
r.use('/pacientes/*', exigirAcesso)

export const rotasDaAgenda = r
  .openapi(horariosLivres, async (c) => {
    const profissionais = await c.var.casos.agenda.horariosLivres(c.var.acesso, c.req.valid('query'))
    return c.json(serializar({ profissionais }), 200)
  })
  .openapi(agendaDoPeriodo, async (c) => {
    const { de, ate, ...filtro } = c.req.valid('query')
    const consultas = await c.var.casos.agenda.agendaDoPeriodo(c.var.acesso, { ...filtro, de: new Date(de), ate: new Date(ate) })
    return c.json(serializar({ consultas }), 200)
  })
  .openapi(verConsulta, async (c) => {
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, c.req.valid('param').id)), 200)
  })
  .openapi(agendar, async (c) => {
    const { inicio, ...pedido } = c.req.valid('json')
    const { consulta } = await c.var.casos.agenda.agendar(c.var.acesso, { ...pedido, inicio: new Date(inicio) })
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, consulta.id)), 201)
  })
  .openapi(remarcar, async (c) => {
    const { id } = c.req.valid('param')
    const { inicio, ...pedido } = c.req.valid('json')
    await c.var.casos.agenda.remarcar(c.var.acesso, id, { ...pedido, inicio: new Date(inicio) })
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, id)), 200)
  })
  .openapi(mudarStatus, async (c) => {
    const { id } = c.req.valid('param')
    await c.var.casos.agenda.mudarStatus(c.var.acesso, id, c.req.valid('json'))
    return c.json(serializar(await c.var.casos.agenda.consulta(c.var.acesso, id)), 200)
  })
  .openapi(buscarPacientes, async (c) => {
    const pacientes = await c.var.casos.agenda.buscarPacientes(c.var.acesso, c.req.valid('query').busca)
    return c.json({ pacientes }, 200)
  })
  .openapi(criarPaciente, async (c) => {
    return c.json(paraPaciente(await c.var.casos.agenda.criarPaciente(c.var.acesso, c.req.valid('json'))), 201)
  })
  .openapi(alterarPaciente, async (c) => {
    const paciente = await c.var.casos.agenda.alterarPaciente(c.var.acesso, c.req.valid('param').id, c.req.valid('json'))
    return c.json(paraPaciente(paciente), 200)
  })
  .openapi(verPaciente, async (c) => {
    const { paciente, consultas, ultimaVisita } = await c.var.casos.agenda.historicoDoPaciente(c.var.acesso, c.req.valid('param').id)
    return c.json(serializar({ paciente: paraPaciente(paciente), consultas, ultimaVisita }), 200)
  })
  .openapi(proximaDoPaciente, async (c) => {
    const consulta = await c.var.casos.agenda.proximaConsulta(c.var.acesso, { pacienteId: c.req.valid('param').id })
    return c.json(serializar({ consulta }), 200)
  })
