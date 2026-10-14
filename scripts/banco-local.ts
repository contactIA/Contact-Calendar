// Banco local para desenvolver sem o Supabase, como no CRM: um PGlite servido
// pelo protocolo do Postgres, com as migrações reais e uma clínica de
// demonstração semeada pelos próprios casos de uso.
//
//   npm run banco:local                 sobe o banco (e semeia na primeira vez)
//   npm run banco:local -- --do-zero    apaga e semeia de novo
//
// Os dados ficam em .banco-local/ (fora do Git). O script escreve .env.local com
// segredos de desenvolvimento se ele ainda não existir. A porta padrão (5440) é
// outra que a do CRM (5433), para os dois subirem juntos.

import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { drizzle } from 'drizzle-orm/pglite'
import { diaNoFuso, diaSeguinte, instanteNoFuso } from '../src/compartilhado/fuso'
import type { Banco } from '../src/infra/banco/conexao'
import * as esquema from '../src/infra/banco/esquema'
import { aplicarMigracoes } from '../src/infra/banco/migracoes'
import { montarCasosDeUso } from '../src/composicao'
import type { Acesso } from '../src/modulos/acesso/aplicacao/acesso'

const PASTA = '.banco-local'
const PORTA = Number(process.env.BANCO_LOCAL_PORTA) || 5440
const PORTA_DO_APP = Number(process.env.APP_LOCAL_PORTA) || 3310
const FUSO = 'America/Sao_Paulo'
const COMPANY_ID = '7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const USUARIOS = {
  gestora: { plataforma: 'a1111111-1111-4111-8111-111111111111', nome: 'Ana Paula Mendes', papel: 'gestor' },
  recepcao: { plataforma: 'b2222222-2222-4222-8222-222222222222', nome: 'Rita Alves', papel: 'recepcao' },
  dentista: { plataforma: 'c3333333-3333-4333-8333-333333333333', nome: 'Dra. Carla Nunes', papel: 'dentista' },
} as const

async function semear(pg: PGlite, banco: Banco) {
  const casos = montarCasosDeUso({ banco, relogio: { agora: () => new Date() } })
  const id = async (sql: string, params: unknown[]) => (await pg.query<{ id: string }>(`${sql} returning id`, params)).rows[0]!.id

  const clinica = await id(`insert into agenda.clinicas (company_id, nome, fuso_horario) values ($1, 'Clínica Sorriso', $2)`, [COMPANY_ID, FUSO])
  const usuario: Record<keyof typeof USUARIOS, string> = { gestora: '', recepcao: '', dentista: '' }
  for (const [chave, u] of Object.entries(USUARIOS) as [keyof typeof USUARIOS, (typeof USUARIOS)[keyof typeof USUARIOS]][]) {
    usuario[chave] = await id(`insert into agenda.usuarios (clinica_id, usuario_plataforma_id, nome, ${u.papel}) values ($1, $2, $3, true)`, [
      clinica,
      u.plataforma,
      u.nome,
    ])
  }
  const gestora: Acesso = {
    tipo: 'usuario',
    clinicaId: clinica,
    usuarioId: usuario.gestora,
    nome: USUARIOS.gestora.nome,
    papeis: { gestor: true, recepcao: false, dentista: false },
    profissionalId: null,
  }
  const recepcao: Acesso = { ...gestora, usuarioId: usuario.recepcao, nome: USUARIOS.recepcao.nome, papeis: { gestor: false, recepcao: true, dentista: false } }

  const c = casos.cadastros
  const centro = await c.criarUnidade(gestora, { nome: 'Centro', endereco: 'Av. Goiás, 1200', telefone: '(62) 3333-1000' })
  const bairro = await c.criarUnidade(gestora, { nome: 'Setor Bueno', endereco: 'Rua T-30, 455' })
  await c.criarCadeira(gestora, { unidadeId: centro.id, nome: 'Consultório 1' })
  await c.criarCadeira(gestora, { unidadeId: centro.id, nome: 'Consultório 2' })
  await c.criarCadeira(gestora, { unidadeId: bairro.id, nome: 'Consultório 1' })
  const orto = await c.criarEspecialidade(gestora, { nome: 'Ortodontia' })
  const implante = await c.criarEspecialidade(gestora, { nome: 'Implantodontia' })
  const avaliacao = await c.criarProcedimento(gestora, { nome: 'Avaliação', duracaoMinutos: 30, cor: '#3b82f6' })
  const limpeza = await c.criarProcedimento(gestora, { nome: 'Limpeza', duracaoMinutos: 60, cor: '#10b981' })
  const manutencao = await c.criarProcedimento(gestora, { nome: 'Manutenção de aparelho', duracaoMinutos: 30, cor: '#a855f7', especialidadeId: orto.id })
  await c.criarProcedimento(gestora, { nome: 'Implante', duracaoMinutos: 90, cor: '#f59e0b', especialidadeId: implante.id })
  const carla = await c.criarProfissional(gestora, {
    nome: 'Dra. Carla Nunes',
    cro: 'CRO-GO 12345',
    cor: '#a855f7',
    usuarioId: usuario.dentista,
    especialidadeIds: [orto.id],
    unidades: [{ unidadeId: centro.id, prioridade: 1 }],
  })
  const bruno = await c.criarProfissional(gestora, {
    nome: 'Dr. Bruno Teixeira',
    cro: 'CRO-GO 67890',
    cor: '#3b82f6',
    especialidadeIds: [implante.id],
    unidades: [
      { unidadeId: centro.id, prioridade: 2 },
      { unidadeId: bairro.id, prioridade: 1 },
    ],
  })
  const semana = (unidadeId: string, dias: number[]) =>
    dias.flatMap((diaSemana) => [
      { unidadeId, diaSemana, inicio: '08:00', fim: '12:00' },
      { unidadeId, diaSemana, inicio: '14:00', fim: '18:00' },
    ])
  await c.definirExpedientes(gestora, carla.id, semana(centro.id, [1, 2, 3, 4, 5]))
  await c.definirExpedientes(gestora, bruno.id, [...semana(centro.id, [1, 3, 5]), ...semana(bairro.id, [2, 4]), { unidadeId: bairro.id, diaSemana: 6, inicio: '08:00', fim: '12:00' }])

  // Consultas de hoje e de amanhã, marcadas pela recepção (que pode encaixar fora do expediente).
  const hoje = diaNoFuso(new Date(), FUSO)
  const amanha = diaSeguinte(hoje)
  const marcar = async (dia: string, hora: string, profissionalId: string, procedimentoId: string, nome: string, telefone: string) =>
    casos.agenda.agendar(recepcao, {
      unidadeId: centro.id,
      profissionalId,
      procedimentoId,
      inicio: instanteNoFuso(dia, hora, FUSO),
      paciente: { nome, telefone },
    })
  const maria = await marcar(hoje, '09:00', carla.id, manutencao.id, 'Maria Souza', '(62) 99901-0001')
  await marcar(hoje, '10:00', bruno.id, avaliacao.id, 'João Antônio Silva', '(62) 99901-0002')
  const pedro = await marcar(hoje, '14:30', carla.id, avaliacao.id, 'Pedro Henrique Lima', '(62) 99901-0003')
  await marcar(hoje, '15:00', bruno.id, limpeza.id, 'Fernanda Oliveira', '(62) 99901-0004')
  await marcar(amanha, '08:30', carla.id, manutencao.id, 'Lucas Martins', '(62) 99901-0005')
  await marcar(amanha, '11:00', bruno.id, avaliacao.id, 'Beatriz Rocha', '(62) 99901-0006')
  await casos.agenda.mudarStatus(recepcao, maria.consulta.id, { status: 'confirmada' })
  await casos.agenda.mudarStatus(recepcao, pedro.consulta.id, { status: 'confirmada' })
  await casos.agenda.criarPaciente(recepcao, { nome: 'Camila Prado', telefone: '(62) 99901-0007', observacoes: 'Prefere horários à tarde' })
  // O almoço do Dr. Bruno amanhã, para a grade mostrar um bloqueio.
  await c.criarBloqueio(recepcao, {
    profissionalId: bruno.id,
    unidadeId: centro.id,
    inicio: instanteNoFuso(amanha, '12:00', FUSO),
    fim: instanteNoFuso(amanha, '13:30', FUSO),
    tipo: 'intervalo',
    motivo: 'Almoço',
  })
}

/** Mensagens que fecham o ciclo de uma conexão: início, consulta simples, Sync e fim. */
const FECHA_O_CICLO = new Set([0x00, 0x51, 0x53, 0x58])

interface FilaDoSocket {
  queue: { handlerId: number; message: Uint8Array; onData: (d: Uint8Array) => void; resolve: (n: number) => void; reject: (e: unknown) => void }[]
  processing: boolean
  lastHandlerId: number | null
  processQueue: () => Promise<void>
  clearQueueForHandler: (handlerId: number) => void
}

/**
 * O PGlite é uma sessão só, e o servidor de socket reveza as conexões a cada
 * mensagem do protocolo. Aqui a fila serve uma conexão até ela fechar o ciclo, e
 * segura a vez dela durante uma transação (a mesma solução do banco local do
 * CRM). Só para desenvolver: o Postgres de verdade separa as conexões sozinho.
 */
function servirUmCicloPorVez(servidor: PGLiteSocketServer, pg: PGlite) {
  const fila = (servidor as unknown as { queryQueue: FilaDoSocket }).queryQueue
  let noMeioDoCiclo: number | null = null
  const limparDaFila = fila.clearQueueForHandler.bind(fila)
  fila.clearQueueForHandler = (handlerId) => {
    if (noMeioDoCiclo === handlerId) noMeioDoCiclo = null
    limparDaFila(handlerId)
  }
  fila.processQueue = async () => {
    if (fila.processing || fila.queue.length === 0) return
    fila.processing = true
    try {
      while (fila.queue.length > 0) {
        const daVez = pg.isInTransaction() && fila.lastHandlerId !== null ? fila.lastHandlerId : noMeioDoCiclo
        const posicao = daVez === null ? 0 : fila.queue.findIndex((item) => item.handlerId === daVez)
        if (posicao === -1) break
        const item = fila.queue.splice(posicao, 1)[0]!
        let bytes = 0
        try {
          await pg.runExclusive(() =>
            pg.execProtocolRawStream(item.message, {
              onRawData: (dados) => {
                bytes += dados.length
                item.onData(dados)
              },
            })
          )
        } catch (erro) {
          noMeioDoCiclo = null
          item.reject(erro)
          continue
        }
        fila.lastHandlerId = item.handlerId
        noMeioDoCiclo = FECHA_O_CICLO.has(item.message[0]!) ? null : item.handlerId
        item.resolve(bytes)
      }
    } finally {
      fila.processing = false
    }
  }
}

async function main() {
  if (process.argv.includes('--do-zero') && existsSync(PASTA)) rmSync(PASTA, { recursive: true, force: true })
  const novo = !existsSync(PASTA)
  const pg = await PGlite.create({ dataDir: PASTA, extensions: { btree_gist, unaccent } })
  const aplicadas = await aplicarMigracoes(pg, join(process.cwd(), 'drizzle'))
  if (aplicadas.length) console.info(`[banco local] migrações aplicadas: ${aplicadas.join(', ')}`)
  if (novo) {
    console.info('[banco local] semeando a clínica de demonstração...')
    await semear(pg, drizzle(pg, { schema: esquema }) as unknown as Banco)
  }

  if (!existsSync('.env.local')) {
    writeFileSync(
      '.env.local',
      [
        '# Gerado por npm run banco:local, só para desenvolver. Nunca use estes valores em produção.',
        `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${PORTA}/postgres`,
        // O PGlite é uma sessão só: mais conexões por processo só esperariam a vez.
        'DATABASE_MAX_CONEXOES=1',
        `AGENDA_SEGREDO_SESSAO=${randomBytes(32).toString('base64url')}`,
        'EMBED_HOSTS=',
        '',
      ].join('\n')
    )
    console.info('[banco local] .env.local criado')
  }

  const servidor = new PGLiteSocketServer({ db: pg, port: PORTA, host: '127.0.0.1', maxConnections: 12 })
  servirUmCicloPorVez(servidor, pg)
  await servidor.start()
  console.info(`[banco local] no ar em 127.0.0.1:${PORTA}. Para entrar como cada pessoa, com o app em http://localhost:${PORTA_DO_APP}:`)
  for (const u of Object.values(USUARIOS)) {
    console.info(`  ${u.nome.padEnd(20)} (${u.papel}): http://localhost:${PORTA_DO_APP}/?companyId=${COMPANY_ID}&userId=${u.plataforma}`)
  }

  const parar = async () => {
    await servidor.stop()
    await pg.close()
    process.exit(0)
  }
  process.on('SIGINT', parar)
  process.on('SIGTERM', parar)
}

main().catch((erro) => {
  console.error('[banco local] falhou:', erro)
  process.exit(1)
})
