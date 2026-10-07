import { pgSchema } from 'drizzle-orm/pg-core'

// O esquema `agenda` no Postgres do projeto do CRM (ADR 0001). Só a agenda escreve
// aqui, e a agenda não lê as tabelas do CRM: o que ela precisa de lá vem pela API.
//
// As tabelas entram na fase 3 do plano (docs/migracao-para-a-arquitetura-do-crm.md),
// com `clinica_id` em todas.

export const agenda = pgSchema('agenda')
