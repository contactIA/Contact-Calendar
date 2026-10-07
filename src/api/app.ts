import { Scalar } from '@scalar/hono-api-reference'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { ErroDeDominio } from '@/compartilhado/erros'
import { casosDeUso, type CasosDeUso } from '@/composicao'
import { tratarErro } from './erros'
import { novoRoteador } from './roteador'
import { rotasDoSistema } from './v1/sistema'
import { VERSAO_DA_API } from './versao'

// A API da agenda (ADR 0001), no mesmo padrão da do CRM. É por ela que a tela, o
// agente de IA e as integrações leem e gravam.
//
// A documentação sai dos mesmos esquemas que validam as rotas, então não tem
// como ficar desatualizada:
//   GET /api/openapi.json  o contrato em OpenAPI 3.1
//   GET /api/docs          a página de referência, com "testar agora"
//
// As rotas só traduzem HTTP: a regra mora nos casos de uso de src/modulos.
//
// Enquanto a migração não termina, as rotas antigas (src/app/api/<rota>/route.ts)
// continuam respondendo nos endereços delas; esta API responde no resto de /api.

const DESCRICAO = `
API da agenda da ContactIA: consultas, horários livres, profissionais e pacientes
de cada clínica. É por ela que a tela, o agente de IA e as integrações leem e
gravam.

**Em construção.** As rotas entram fase a fase; por enquanto há só a saúde.

## Regras

**Erros.** Toda resposta de erro tem o formato
\`{ "erro": "frase para quem lê", "codigo": "CODIGO_ESTAVEL" }\`. Quando a requisição
não passa na validação, vem também \`detalhes\`, com o campo e o motivo.

**Versões.** Mudança que quebra quem já integra ganha um prefixo novo (\`/v2\`).
`

/** As seções do documento, na ordem em que uma integração costuma precisar delas. */
const SECOES = [{ name: 'Sistema', description: 'Saúde da API.' }]

/** Monta os casos de uso só no primeiro uso: a documentação abre sem banco nem segredo. */
function preguicoso<T extends object>(criar: () => T): T {
  let alvo: T | null = null
  return new Proxy({} as T, { get: (_, propriedade) => Reflect.get((alvo ??= criar()), propriedade) })
}

const MB = 1024 * 1024

/**
 * A documentação no ReadMe, no mesmo projeto da do CRM. O "Try It" de lá chama a
 * API direto do navegador, sem o proxy do ReadMe, para a chave não passar pelo
 * servidor deles.
 */
export const ORIGENS_DA_DOCUMENTACAO = ['https://contactiacrm.readme.io']

export function criarApi(obterCasos: () => CasosDeUso = casosDeUso) {
  const api = novoRoteador().basePath('/api')

  api.use('*', async (c, next) => {
    c.set('casos', preguicoso(obterCasos))
    await next()
    // Resposta da API não fica em cache de ninguém: pode ter dado de paciente.
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
    c.header('X-Content-Type-Options', 'nosniff')
  })
  // CORS só para a documentação, e só com os cabeçalhos de quem integra. A
  // autenticação é por cabeçalho, sem cookie.
  api.use(
    '/v1/*',
    cors({
      origin: ORIGENS_DA_DOCUMENTACAO,
      allowHeaders: ['Authorization', 'X-Clinica', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      maxAge: 600,
    })
  )
  // GET e DELETE não levam corpo. Sem Content-Length (o DELETE do navegador não
  // manda), o bodyLimit lê o corpo e remonta o Request a partir do NextRequest, e
  // isso quebra: no CRM, toda DELETE dava 500.
  const semCorpo = (metodo: string) => metodo === 'GET' || metodo === 'HEAD' || metodo === 'DELETE'
  const muitoGrande = () => {
    throw new ErroDeDominio('invalido', 'CORPO_GRANDE', 'O corpo da requisição é grande demais')
  }
  api.use('/v1/*', async (c, next) => (semCorpo(c.req.method) ? next() : bodyLimit({ maxSize: 1 * MB, onError: muitoGrande })(c, next)))

  api.openAPIRegistry.registerComponent('securitySchemes', 'ChaveDaApi', {
    type: 'http',
    scheme: 'bearer',
    description: 'A chave da integração, criada pela equipe da ContactIA',
  })
  api.openAPIRegistry.registerComponent('securitySchemes', 'Clinica', {
    type: 'apiKey',
    in: 'header',
    name: 'X-Clinica',
    description: 'Só para a chave que alcança mais de uma clínica: o id da clínica ou o companyId da conta. Com uma clínica só, deixe vazio',
  })

  for (const rotas of [rotasDoSistema]) {
    api.route('/v1', rotas)
  }

  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Agenda ContactIA', version: VERSAO_DA_API, description: DESCRICAO.trim() },
    tags: SECOES,
  })
  api.get(
    '/docs',
    Scalar({
      url: '/api/openapi.json',
      pageTitle: 'Agenda ContactIA · API',
      // Versão fixa, a mesma do CRM: a "mais nova" da CDN mudaria a documentação sem aviso.
      bundle: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/esm.js',
      // Nada de mandar o contrato para os serviços de nuvem do Scalar.
      agent: { disabled: true },
      mcp: { disabled: true },
      showDeveloperTools: 'never',
      telemetry: false,
      authentication: { preferredSecurityScheme: [['ChaveDaApi', 'Clinica']] },
      persistAuth: true,
      defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
      hideModels: true,
    })
  )

  api.notFound((c) => c.json({ erro: 'Rota não encontrada', codigo: 'ROTA_NAO_ENCONTRADA' }, 404))
  api.onError(tratarErro)
  return api
}
