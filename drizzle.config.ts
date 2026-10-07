import { defineConfig } from 'drizzle-kit'

// `npm run db:gerar` lê o esquema e escreve a migração em ./drizzle, sem tocar no
// banco. Aplicar em produção é outra etapa, sempre com OK explícito da equipe.

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infra/banco/esquema.ts',
  out: './drizzle',
  schemaFilter: ['agenda'],
  // O controle do que já foi aplicado mora dentro do próprio esquema agenda, para
  // a agenda não criar nada fora dele no banco compartilhado com o CRM.
  migrations: { schema: 'agenda', table: '__drizzle_migrations' },
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
