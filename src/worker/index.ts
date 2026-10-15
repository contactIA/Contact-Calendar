import { loadEnvConfig } from '@next/env'
import { casosDeUso } from '@/composicao'
import { criarFila } from '@/infra/fila/fila'

// Os mesmos arquivos .env que o Next lê (.env, .env.local...), para o worker de
// desenvolvimento ver o mesmo banco que o app. No container não há arquivo: as
// variáveis vêm do compose, e isto não faz nada.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')

// Processo das tarefas em segundo plano (ADR 0001): mesmo código do app, outro
// processo (`npm run worker`).
//
//   · Ciclos curtos, a cada poucos segundos, como no CRM: entregar ao CRM os
//     avisos da caixa de saída (fase 7). Cada ciclo reserva o que vai fazer no
//     banco (for update skip locked), então dois workers não fazem a mesma coisa.
//   · A fila (pg-boss) fica no ar para as rotinas com horário que vierem depois.

interface Ciclo {
  nome: string
  intervaloMs: number
  fazer: () => Promise<unknown>
}

let parando = false

async function rodarCiclo(ciclo: Ciclo): Promise<void> {
  while (!parando) {
    const inicio = Date.now()
    try {
      const resultado = await ciclo.fazer()
      const total = (resultado as { total?: number } | undefined)?.total
      if (total) console.info(`[worker] ${ciclo.nome}:`, JSON.stringify(resultado))
    } catch (erro) {
      console.error(`[worker] ${ciclo.nome} falhou:`, erro)
    }
    const espera = Math.max(250, ciclo.intervaloMs - (Date.now() - inicio))
    await new Promise((r) => setTimeout(r, espera))
  }
}

async function main() {
  const casos = casosDeUso()
  const fila = criarFila()
  fila.on('error', (erro) => console.error('[worker] erro na fila:', erro))
  await fila.start()

  if (!process.env.CRM_URL || !process.env.CRM_CHAVE) {
    console.warn('[worker] sem CRM_URL e CRM_CHAVE: os avisos ao CRM esperam na caixa de saída')
  }
  const ciclos: Ciclo[] = [{ nome: 'avisos ao CRM', intervaloMs: 3_000, fazer: () => casos.crm.entregarPendentes() }]
  const rodando = ciclos.map(rodarCiclo)
  console.info('[worker] no ar')

  const parar = async () => {
    if (parando) return
    parando = true
    console.info('[worker] parando...')
    await Promise.race([Promise.all(rodando), new Promise((r) => setTimeout(r, 20_000))])
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
