import { PgBoss } from 'pg-boss'

// Fila das tarefas em segundo plano (ADR 0001, como no CRM), no próprio Postgres,
// com o pg-boss: novas tentativas, agendamento e rotinas prontos, sem
// infraestrutura nova. As tabelas dele ficam num esquema separado, `agenda_fila`,
// que o pg-boss cria sozinho no primeiro start.

export function criarFila(): PgBoss {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL ausente: configure a conexão com o Postgres no .env')
  return new PgBoss({ connectionString: url, schema: 'agenda_fila', max: Number(process.env.DATABASE_MAX_CONEXOES) || 4 })
}
