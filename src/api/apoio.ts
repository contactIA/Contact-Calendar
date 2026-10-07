import { z } from '@hono/zod-openapi'

// Peças que toda rota usa: o formato do erro, as respostas de erro de cada
// status, a segurança e a serialização das datas. As mesmas do CRM, para quem
// integra os dois ver o mesmo jeito de responder.

export const Erro = z
  .object({
    erro: z.string().openapi({ example: 'Consulta não encontrada' }),
    codigo: z.string().openapi({ example: 'CONSULTA_NAO_ENCONTRADA' }),
    detalhes: z.array(z.object({ campo: z.string(), mensagem: z.string() })).optional(),
  })
  .openapi('Erro')

const DESCRICAO_DO_ERRO = {
  400: 'Requisição inválida: veja `detalhes`, ou a regra de negócio recusou',
  401: 'Sem credencial válida',
  403: 'A credencial não permite isto',
  404: 'Não encontrado',
  409: 'Conflito com o estado atual (ex.: o horário foi ocupado)',
  429: 'Muitas tentativas',
  502: 'Um sistema de fora (a plataforma de mensagens, o CRM) falhou ou recusou',
  503: 'O servidor não está configurado para isto',
} as const

type StatusDeErro = keyof typeof DESCRICAO_DO_ERRO

/** As respostas de erro de uma rota, todas no formato `{ erro, codigo }`. */
export function erros<S extends StatusDeErro>(...status: S[]) {
  return Object.fromEntries(
    status.map((s) => [s, { description: DESCRICAO_DO_ERRO[s], content: { 'application/json': { schema: Erro } } }])
  ) as unknown as { [K in S]: { description: string; content: { 'application/json': { schema: typeof Erro } } } }
}

/** Os erros que quase toda rota protegida pode dar. */
export const ERROS_COMUNS = [400, 401, 403, 404] as const

export function json<T extends z.ZodType>(schema: T, description: string) {
  return { description, content: { 'application/json': { schema } } }
}

/** O corpo JSON da rota. O exemplo, quando vem, é o que o "testar" do /api/docs já traz preenchido. */
export function corpoJson<T extends z.ZodType>(schema: T, exemplo?: z.input<T>) {
  return { body: { required: true, content: { 'application/json': { schema, ...(exemplo === undefined ? {} : { example: exemplo }) } } } }
}

type Seguranca = Record<string, string[]>[]

/** O que o documento mostra para quem integra: a chave e, quando ela alcança mais de uma clínica, o `X-Clinica`. */
export const SEGURANCA: Seguranca = [{ ChaveDaApi: [], Clinica: [] }]

/** Datas viram texto ISO no JSON; o tipo acompanha. */
export type Serializado<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Serializado<U>[]
    : T extends object
      ? { [K in keyof T]: Serializado<T[K]> }
      : T

export const serializar = <T>(valor: T): Serializado<T> => JSON.parse(JSON.stringify(valor)) as Serializado<T>

export const Uuid = z.uuid()

export const ParametroId = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, example: '3f5c9a1e-8d2b-4c1a-9e7f-2b6d4a8c0e11' }),
})

/** "a,b,c" → ["a", "b", "c"]. Listas na query vão separadas por vírgula. */
export const lista = (texto: string | undefined) =>
  texto
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export const instante = (texto: string | undefined) => (texto ? new Date(texto) : undefined)

export const DataHora = z.iso.datetime({ offset: true }).openapi({ example: '2026-10-08T10:00:00-03:00' })
