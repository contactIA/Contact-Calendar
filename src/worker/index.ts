import { loadEnvConfig } from '@next/env'
import { criarFila } from '@/infra/fila/fila'

// Os mesmos arquivos .env que o Next lê (.env, .env.local...), para o worker de
// desenvolvimento ver o mesmo banco que o app. No container não há arquivo: as
// variáveis vêm do compose, e isto não faz nada.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')

// Processo das tarefas em segundo plano (ADR 0001): mesmo código do app, outro
// processo (`npm run worker`). Os ciclos entram com o que precisa deles: a
// entrega dos avisos ao CRM, a confirmação e o lembrete da consulta (fase 7).

async function main() {
  const fila = criarFila()
  fila.on('error', (erro) => console.error('[worker] erro na fila:', erro))
  await fila.start()
  console.info('[worker] no ar')

  let parando = false
  const parar = async () => {
    if (parando) return
    parando = true
    console.info('[worker] parando...')
    await fila.stop()
    process.exit(0)
  }
  process.on('SIGTERM', parar)
  process.on('SIGINT', parar)
}

main().catch((erro) => {
  console.error('[worker] não subiu:', erro)
  process.exit(1)
})
