import { z } from '@hono/zod-openapi'
import { STATUS_DA_CONSULTA, TIPOS_DE_BLOQUEIO, TIPOS_DE_CHAVE_API } from '@/compartilhado/vocabulario'

// Os formatos que a API devolve, num lugar só: a mesma consulta sai igual na
// agenda, no agente e no Paciente 360. Datas em ISO 8601, com fuso.

const Id = z.uuid()
const Instante = z.string().openapi({ format: 'date-time', example: '2026-10-08T13:00:00.000Z' })
const Referencia = z.object({ id: Id, nome: z.string() })

export const StatusDaConsulta = z.enum(STATUS_DA_CONSULTA).openapi({
  description: 'agendada → confirmada → em_atendimento → concluida; a agendada ou confirmada pode virar cancelada ou faltou',
})

export const Consulta = z
  .object({
    id: Id,
    inicio: Instante,
    fim: Instante,
    status: StatusDaConsulta,
    observacoes: z.string().nullable(),
    versao: z.number().int().openapi({ description: 'Mande de volta ao mudar a consulta: se outra pessoa mudou antes, a resposta é 409' }),
    unidade: Referencia,
    cadeira: Referencia,
    profissional: Referencia.extend({ cor: z.string() }),
    paciente: Referencia.extend({ telefone: z.string().nullable() }),
    procedimento: Referencia.extend({ cor: z.string() }),
  })
  .openapi('Consulta')

export const HorarioLivre = z
  .object({ inicio: Instante, fim: Instante, cadeiraId: Id.openapi({ description: 'A cadeira livre nesse horário' }) })
  .openapi('HorarioLivre')

export const Paciente = z
  .object({
    id: Id,
    nome: z.string(),
    telefone: z.string().nullable().openapi({ example: '+5562999990000' }),
    email: z.string().nullable(),
    nascimento: z.string().nullable().openapi({ example: '1990-05-21' }),
    observacoes: z.string().nullable(),
  })
  .openapi('Paciente')

export const PacienteEncontrado = Paciente.omit({ observacoes: true }).openapi('PacienteEncontrado')

export const Unidade = z
  .object({
    id: Id,
    nome: z.string(),
    endereco: z.string().nullable(),
    telefone: z.string().nullable(),
    ativa: z.boolean(),
    crmUnidadeId: Id.nullable().openapi({ description: 'A unidade correspondente no CRM; vazia, o card do paciente vai para "Sem unidade"' }),
  })
  .openapi('Unidade')

export const Cadeira = z.object({ id: Id, unidadeId: Id, nome: z.string(), ativa: z.boolean() }).openapi('Cadeira')

export const Especialidade = z.object({ id: Id, nome: z.string() }).openapi('Especialidade')

export const Procedimento = z
  .object({
    id: Id,
    nome: z.string(),
    duracaoMinutos: z.number().int(),
    cor: z.string().openapi({ example: '#10B981' }),
    especialidadeId: Id.nullable().openapi({ description: 'Vazia: qualquer profissional faz' }),
    ativo: z.boolean(),
  })
  .openapi('Procedimento')

export const UnidadeDoProfissional = z
  .object({
    unidadeId: Id,
    prioridade: z.number().int().min(0).max(1000).openapi({ description: 'Menor vem primeiro na recomendação do agente', example: 1 }),
  })
  .openapi('UnidadeDoProfissional')

export const Profissional = z
  .object({
    id: Id,
    nome: z.string(),
    cro: z.string().nullable(),
    cor: z.string(),
    usuarioId: Id.nullable().openapi({ description: 'O usuário da agenda, quando o profissional entra pela plataforma' }),
    ativo: z.boolean(),
    especialidadeIds: z.array(Id),
    unidades: z.array(UnidadeDoProfissional),
  })
  .openapi('Profissional')

export const Expediente = z
  .object({
    unidadeId: Id,
    diaSemana: z.number().int().min(0).max(6).openapi({ description: '0 é domingo; 6, sábado', example: 1 }),
    inicio: z.string().openapi({ example: '08:00' }),
    fim: z.string().openapi({ example: '12:00' }),
  })
  .openapi('Expediente')

export const Bloqueio = z
  .object({
    id: Id,
    profissionalId: Id,
    unidadeId: Id.nullable().openapi({ description: 'Só para mostrar: o bloqueio vale em todas as unidades' }),
    inicio: Instante,
    fim: Instante,
    tipo: z.enum(TIPOS_DE_BLOQUEIO),
    motivo: z.string().nullable(),
    criadoPorId: Id.nullable(),
  })
  .openapi('Bloqueio')

export const Chave = z
  .object({
    id: Id,
    nome: z.string(),
    tipo: z.enum(TIPOS_DE_CHAVE_API).openapi({ description: '`ia` para o agente de IA; `integracao` para os outros sistemas' }),
    prefixo: z.string().openapi({ description: 'O começo da chave, para reconhecer qual é', example: 'agd_Xk2f9QaL' }),
    podeEscrever: z.boolean(),
    criadoEm: Instante,
    ultimoUsoEm: Instante.nullable(),
    revogadaEm: Instante.nullable(),
  })
  .openapi('Chave')
