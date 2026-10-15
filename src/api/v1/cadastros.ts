import { createRoute, z } from '@hono/zod-openapi'
import { TIPOS_DE_BLOQUEIO, TIPOS_DE_CHAVE_API } from '@/compartilhado/vocabulario'
import { corpoJson, DataHora, ERROS_COMUNS, erros, json, ParametroId, SEGURANCA, serializar } from '../apoio'
import { exigirAcesso } from '../autenticacao'
import { novoRoteador } from '../roteador'
import { Bloqueio, Cadeira, Chave, Especialidade, Expediente, Procedimento, Profissional, Unidade, UnidadeDoProfissional } from './esquemas'

// Os cadastros da clínica e as chaves da API. Todo acesso lê: a tela e o agente
// precisam das listas para agendar. Quem cadastra é o gestor; os bloqueios,
// também a recepção e as chaves que gravam.
//
// Nada se apaga, se desativa (`ativa`/`ativo`): a consulta antiga continua
// apontando para a cadeira e o procedimento dela. As exceções são a especialidade
// sem uso e o bloqueio.

const tags = ['Cadastros']
const Nome = z.string().min(1).max(120)
const Cor = z.string().openapi({ description: 'No formato #RRGGBB', example: '#3B82F6' })
const SoGestor = 'Só o gestor.'

/** Uma rota de cadastro, com a segurança e os erros de sempre. */
function rota<const R extends Parameters<typeof createRoute>[0]>(definicao: R) {
  return createRoute({ tags, security: SEGURANCA, ...definicao })
}

const ok = { 204: { description: 'Feito' } }

// ── Unidades e cadeiras ──────────────────────────────────────────────────────

const DadosDaUnidade = z.object({
  nome: Nome.openapi({ example: 'Centro' }),
  endereco: z.string().max(300).nullable().optional(),
  telefone: z.string().max(30).nullable().optional(),
  crmUnidadeId: z.uuid().nullable().optional(),
})

const unidades = rota({
  method: 'get',
  path: '/unidades',
  summary: 'As unidades',
  description: 'As desativadas inclusive. Quem tem unidades vinculadas vê só as delas.',
  responses: { 200: json(z.object({ unidades: z.array(Unidade) }), 'As unidades, por nome'), ...erros(...ERROS_COMUNS) },
})

const criarUnidade = rota({
  method: 'post',
  path: '/unidades',
  summary: 'Criar unidade',
  description: SoGestor,
  request: corpoJson(DadosDaUnidade, { nome: 'Zona Sul' }),
  responses: { 201: json(Unidade, 'A unidade'), ...erros(...ERROS_COMUNS, 409) },
})

const alterarUnidade = rota({
  method: 'patch',
  path: '/unidades/{id}',
  summary: 'Alterar ou desativar unidade',
  description: `${SoGestor} A clínica precisa de pelo menos uma unidade ativa.`,
  request: { params: ParametroId, ...corpoJson(DadosDaUnidade.partial().extend({ ativa: z.boolean().optional() }), { ativa: false }) },
  responses: { 200: json(Unidade, 'A unidade'), ...erros(...ERROS_COMUNS, 409) },
})

const cadeiras = rota({
  method: 'get',
  path: '/cadeiras',
  summary: 'As cadeiras',
  request: { query: z.object({ unidadeId: z.uuid().optional() }) },
  responses: { 200: json(z.object({ cadeiras: z.array(Cadeira) }), 'As cadeiras, por nome'), ...erros(...ERROS_COMUNS) },
})

const criarCadeira = rota({
  method: 'post',
  path: '/cadeiras',
  summary: 'Criar cadeira',
  description: `${SoGestor} O nome não repete na unidade.`,
  request: corpoJson(z.object({ unidadeId: z.uuid(), nome: Nome.openapi({ example: 'Consultório 1' }) })),
  responses: { 201: json(Cadeira, 'A cadeira'), ...erros(...ERROS_COMUNS, 409) },
})

const alterarCadeira = rota({
  method: 'patch',
  path: '/cadeiras/{id}',
  summary: 'Renomear ou desativar cadeira',
  description: SoGestor,
  request: { params: ParametroId, ...corpoJson(z.object({ nome: Nome.optional(), ativa: z.boolean().optional() }), { ativa: false }) },
  responses: { 200: json(Cadeira, 'A cadeira'), ...erros(...ERROS_COMUNS, 409) },
})

// ── Especialidades e procedimentos ───────────────────────────────────────────

const especialidades = rota({
  method: 'get',
  path: '/especialidades',
  summary: 'As especialidades',
  responses: { 200: json(z.object({ especialidades: z.array(Especialidade) }), 'As especialidades, por nome'), ...erros(...ERROS_COMUNS) },
})

const criarEspecialidade = rota({
  method: 'post',
  path: '/especialidades',
  summary: 'Criar especialidade',
  description: SoGestor,
  request: corpoJson(z.object({ nome: Nome.openapi({ example: 'Ortodontia' }) })),
  responses: { 201: json(Especialidade, 'A especialidade'), ...erros(...ERROS_COMUNS, 409) },
})

const renomearEspecialidade = rota({
  method: 'patch',
  path: '/especialidades/{id}',
  summary: 'Renomear especialidade',
  description: SoGestor,
  request: { params: ParametroId, ...corpoJson(z.object({ nome: Nome })) },
  responses: { 200: json(Especialidade, 'A especialidade'), ...erros(...ERROS_COMUNS, 409) },
})

const apagarEspecialidade = rota({
  method: 'delete',
  path: '/especialidades/{id}',
  summary: 'Apagar especialidade',
  description: `${SoGestor} Só a que nenhum procedimento nem profissional usa (senão, 409).`,
  request: { params: ParametroId },
  responses: { ...ok, ...erros(...ERROS_COMUNS, 409) },
})

const DadosDoProcedimento = z.object({
  nome: Nome.openapi({ example: 'Avaliação' }),
  duracaoMinutos: z.number().int().min(5).max(480).openapi({ example: 60 }),
  cor: Cor.optional(),
  especialidadeId: z.uuid().nullable().optional().openapi({ description: 'Vazia: qualquer profissional faz' }),
})

const procedimentos = rota({
  method: 'get',
  path: '/procedimentos',
  summary: 'Os procedimentos',
  description: 'Os desativados inclusive.',
  responses: { 200: json(z.object({ procedimentos: z.array(Procedimento) }), 'Os procedimentos, por nome'), ...erros(...ERROS_COMUNS) },
})

const criarProcedimento = rota({
  method: 'post',
  path: '/procedimentos',
  summary: 'Criar procedimento',
  description: `${SoGestor} A duração do procedimento é a da consulta; quem agenda pode mudar a de uma consulta.`,
  request: corpoJson(DadosDoProcedimento, { nome: 'Limpeza', duracaoMinutos: 30 }),
  responses: { 201: json(Procedimento, 'O procedimento'), ...erros(...ERROS_COMUNS, 409) },
})

const alterarProcedimento = rota({
  method: 'patch',
  path: '/procedimentos/{id}',
  summary: 'Alterar ou desativar procedimento',
  description: SoGestor,
  request: { params: ParametroId, ...corpoJson(DadosDoProcedimento.partial().extend({ ativo: z.boolean().optional() }), { duracaoMinutos: 45 }) },
  responses: { 200: json(Procedimento, 'O procedimento'), ...erros(...ERROS_COMUNS, 409) },
})

// ── Profissionais e expedientes ──────────────────────────────────────────────

const DadosDoProfissional = z.object({
  nome: Nome.openapi({ example: 'Dra. Ana Lima' }),
  cro: z.string().max(40).nullable().optional(),
  cor: Cor.optional(),
  usuarioId: z.uuid().nullable().optional(),
  idNoProntuario: z.string().trim().max(60).nullable().optional().openapi({ description: 'O id do dentista no prontuário (a Clinicorp)' }),
  especialidadeIds: z.array(z.uuid()).max(50).optional(),
  unidades: z.array(UnidadeDoProfissional).max(50).optional().openapi({ description: 'Onde atende, com a prioridade em cada unidade' }),
})

const profissionais = rota({
  method: 'get',
  path: '/profissionais',
  summary: 'Os profissionais',
  description: 'Com as especialidades e as unidades onde atendem. Os desativados inclusive.',
  responses: { 200: json(z.object({ profissionais: z.array(Profissional) }), 'Os profissionais, por nome'), ...erros(...ERROS_COMUNS) },
})

const criarProfissional = rota({
  method: 'post',
  path: '/profissionais',
  summary: 'Criar profissional',
  description: `${SoGestor} O profissional sem usuário recebe consultas do mesmo jeito.`,
  request: corpoJson(DadosDoProfissional, { nome: 'Dra. Ana Lima', unidades: [{ unidadeId: '3f5c9a1e-8d2b-4c1a-9e7f-2b6d4a8c0e11', prioridade: 1 }] }),
  responses: { 201: json(Profissional, 'O profissional'), ...erros(...ERROS_COMUNS, 409) },
})

const alterarProfissional = rota({
  method: 'patch',
  path: '/profissionais/{id}',
  summary: 'Alterar ou desativar profissional',
  description: `${SoGestor} As listas que vierem substituem as de antes. Tirar uma unidade apaga os expedientes dele lá.`,
  request: { params: ParametroId, ...corpoJson(DadosDoProfissional.partial().extend({ ativo: z.boolean().optional() }), { cor: '#8B5CF6' }) },
  responses: { 200: json(Profissional, 'O profissional'), ...erros(...ERROS_COMUNS, 409) },
})

const expedientes = rota({
  method: 'get',
  path: '/profissionais/{id}/expedientes',
  summary: 'A semana de trabalho do profissional',
  request: { params: ParametroId },
  responses: { 200: json(z.object({ expedientes: z.array(Expediente) }), 'Os intervalos, por dia e hora'), ...erros(...ERROS_COMUNS) },
})

const definirExpedientes = rota({
  method: 'put',
  path: '/profissionais/{id}/expedientes',
  summary: 'Trocar a semana de trabalho do profissional',
  description: `${SoGestor} Manda a semana inteira: o que não vier sai. Pode haver mais de um intervalo no dia (manhã e tarde, ou duas unidades), mas dois do mesmo profissional nunca se cruzam, nem em unidades diferentes. As horas são no fuso da clínica.`,
  request: {
    params: ParametroId,
    ...corpoJson(z.object({ expedientes: z.array(Expediente).max(100) }), {
      expedientes: [
        { unidadeId: '3f5c9a1e-8d2b-4c1a-9e7f-2b6d4a8c0e11', diaSemana: 1, inicio: '08:00', fim: '12:00' },
        { unidadeId: '3f5c9a1e-8d2b-4c1a-9e7f-2b6d4a8c0e11', diaSemana: 1, inicio: '14:00', fim: '18:00' },
      ],
    }),
  },
  responses: { 200: json(z.object({ expedientes: z.array(Expediente) }), 'A semana gravada'), ...erros(...ERROS_COMUNS) },
})

// ── Bloqueios ────────────────────────────────────────────────────────────────

const bloqueios = rota({
  method: 'get',
  path: '/bloqueios',
  summary: 'Os bloqueios de um período',
  description: 'Os que cruzam o período, de até um ano. O dentista vê os dele.',
  request: { query: z.object({ de: DataHora, ate: DataHora, profissionalId: z.uuid().optional() }) },
  responses: { 200: json(z.object({ bloqueios: z.array(Bloqueio) }), 'Os bloqueios, por início'), ...erros(...ERROS_COMUNS) },
})

const criarBloqueio = rota({
  method: 'post',
  path: '/bloqueios',
  summary: 'Bloquear o profissional',
  description:
    'Férias, reunião, horário reservado. Tira o profissional da agenda no período, em todas as unidades. As consultas que já estão no período continuam: a recepção remarca.',
  request: corpoJson(
    z.object({
      profissionalId: z.uuid(),
      unidadeId: z.uuid().nullable().optional(),
      inicio: DataHora,
      fim: DataHora,
      tipo: z.enum(TIPOS_DE_BLOQUEIO),
      motivo: z.string().max(500).nullable().optional(),
    }),
    {
      profissionalId: '8b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e',
      inicio: '2026-10-08T08:00:00-03:00',
      fim: '2026-10-08T12:00:00-03:00',
      tipo: 'reuniao',
      motivo: 'Congresso',
    }
  ),
  responses: { 201: json(Bloqueio, 'O bloqueio'), ...erros(...ERROS_COMUNS) },
})

const apagarBloqueio = rota({
  method: 'delete',
  path: '/bloqueios/{id}',
  summary: 'Apagar bloqueio',
  request: { params: ParametroId },
  responses: { ...ok, ...erros(...ERROS_COMUNS) },
})

// ── Chaves ───────────────────────────────────────────────────────────────────

const chaves = rota({
  method: 'get',
  path: '/chaves',
  tags: ['Chaves'],
  summary: 'As chaves da API da clínica',
  description: `${SoGestor} O texto da chave não aparece: só o começo, para reconhecer qual é.`,
  responses: { 200: json(z.object({ chaves: z.array(Chave) }), 'As chaves, as revogadas inclusive'), ...erros(...ERROS_COMUNS) },
})

const criarChave = rota({
  method: 'post',
  path: '/chaves',
  tags: ['Chaves'],
  summary: 'Criar chave da API',
  description: `${SoGestor} O texto da chave vem só nesta resposta: guarde-o no agente ou na integração.`,
  request: corpoJson(z.object({ nome: Nome, tipo: z.enum(TIPOS_DE_CHAVE_API), podeEscrever: z.boolean().default(false) }), {
    nome: 'Agente de IA',
    tipo: 'ia',
    podeEscrever: true,
  }),
  responses: { 201: json(Chave.extend({ chave: z.string().openapi({ example: 'agd_Xk2f9QaL...' }) }), 'A chave, com o texto'), ...erros(...ERROS_COMUNS) },
})

const revogarChave = rota({
  method: 'delete',
  path: '/chaves/{id}',
  tags: ['Chaves'],
  summary: 'Revogar chave da API',
  description: `${SoGestor} Vale na hora: o próximo pedido com ela recebe 401.`,
  request: { params: ParametroId },
  responses: { ...ok, ...erros(...ERROS_COMUNS) },
})

const r = novoRoteador()
for (const caminho of ['/unidades', '/cadeiras', '/especialidades', '/procedimentos', '/profissionais', '/bloqueios', '/chaves']) {
  r.use(caminho, exigirAcesso)
  r.use(`${caminho}/*`, exigirAcesso)
}

export const rotasDosCadastros = r
  .openapi(unidades, async (c) => c.json({ unidades: await c.var.casos.cadastros.unidades(c.var.acesso) }, 200))
  .openapi(criarUnidade, async (c) => c.json(await c.var.casos.cadastros.criarUnidade(c.var.acesso, c.req.valid('json')), 201))
  .openapi(alterarUnidade, async (c) => c.json(await c.var.casos.cadastros.alterarUnidade(c.var.acesso, c.req.valid('param').id, c.req.valid('json')), 200))
  .openapi(cadeiras, async (c) => c.json({ cadeiras: await c.var.casos.cadastros.cadeiras(c.var.acesso, c.req.valid('query').unidadeId) }, 200))
  .openapi(criarCadeira, async (c) => c.json(await c.var.casos.cadastros.criarCadeira(c.var.acesso, c.req.valid('json')), 201))
  .openapi(alterarCadeira, async (c) => c.json(await c.var.casos.cadastros.alterarCadeira(c.var.acesso, c.req.valid('param').id, c.req.valid('json')), 200))
  .openapi(especialidades, async (c) => c.json({ especialidades: await c.var.casos.cadastros.especialidades(c.var.acesso) }, 200))
  .openapi(criarEspecialidade, async (c) => c.json(await c.var.casos.cadastros.criarEspecialidade(c.var.acesso, c.req.valid('json')), 201))
  .openapi(renomearEspecialidade, async (c) =>
    c.json(await c.var.casos.cadastros.renomearEspecialidade(c.var.acesso, c.req.valid('param').id, c.req.valid('json')), 200)
  )
  .openapi(apagarEspecialidade, async (c) => {
    await c.var.casos.cadastros.apagarEspecialidade(c.var.acesso, c.req.valid('param').id)
    return c.body(null, 204)
  })
  .openapi(procedimentos, async (c) => c.json({ procedimentos: await c.var.casos.cadastros.procedimentos(c.var.acesso) }, 200))
  .openapi(criarProcedimento, async (c) => c.json(await c.var.casos.cadastros.criarProcedimento(c.var.acesso, c.req.valid('json')), 201))
  .openapi(alterarProcedimento, async (c) =>
    c.json(await c.var.casos.cadastros.alterarProcedimento(c.var.acesso, c.req.valid('param').id, c.req.valid('json')), 200)
  )
  .openapi(profissionais, async (c) => c.json({ profissionais: await c.var.casos.cadastros.profissionais(c.var.acesso) }, 200))
  .openapi(criarProfissional, async (c) => c.json(await c.var.casos.cadastros.criarProfissional(c.var.acesso, c.req.valid('json')), 201))
  .openapi(alterarProfissional, async (c) =>
    c.json(await c.var.casos.cadastros.alterarProfissional(c.var.acesso, c.req.valid('param').id, c.req.valid('json')), 200)
  )
  .openapi(expedientes, async (c) => {
    const lidos = await c.var.casos.cadastros.expedientes(c.var.acesso, c.req.valid('param').id)
    return c.json({ expedientes: lidos.map(({ id: _, ...e }) => e) }, 200)
  })
  .openapi(definirExpedientes, async (c) => {
    const gravados = await c.var.casos.cadastros.definirExpedientes(c.var.acesso, c.req.valid('param').id, c.req.valid('json').expedientes)
    return c.json({ expedientes: gravados.map(({ id: _, ...e }) => e) }, 200)
  })
  .openapi(bloqueios, async (c) => {
    const { de, ate, profissionalId } = c.req.valid('query')
    const lidos = await c.var.casos.cadastros.bloqueios(c.var.acesso, { de: new Date(de), ate: new Date(ate), profissionalId })
    return c.json(serializar({ bloqueios: lidos }), 200)
  })
  .openapi(criarBloqueio, async (c) => {
    const { inicio, fim, ...pedido } = c.req.valid('json')
    return c.json(serializar(await c.var.casos.cadastros.criarBloqueio(c.var.acesso, { ...pedido, inicio: new Date(inicio), fim: new Date(fim) })), 201)
  })
  .openapi(apagarBloqueio, async (c) => {
    await c.var.casos.cadastros.apagarBloqueio(c.var.acesso, c.req.valid('param').id)
    return c.body(null, 204)
  })
  .openapi(chaves, async (c) => c.json(serializar({ chaves: await c.var.casos.acesso.listarChaves(c.var.acesso) }), 200))
  .openapi(criarChave, async (c) => c.json(serializar(await c.var.casos.acesso.criarChave(c.var.acesso, c.req.valid('json'))), 201))
  .openapi(revogarChave, async (c) => {
    await c.var.casos.acesso.revogarChave(c.var.acesso, c.req.valid('param').id)
    return c.body(null, 204)
  })
