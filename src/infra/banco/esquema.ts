import { sql, type SQL } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
// Caminho relativo de propósito: o carregador do drizzle-kit não resolve o "@/".
import {
  ACOES_NA_PLATAFORMA,
  AVISOS_AO_CRM,
  CADENCIAS_DA_GRADE,
  DESTINOS_DE_AVISO,
  SITUACOES_DA_VINDA,
  SITUACOES_DE_AVISO,
  SITUACOES_DE_ENTRADA,
  STATUS_DA_CONSULTA,
  TIPOS_DE_ATOR,
  TIPOS_DE_BLOQUEIO,
  TIPOS_DE_CHAVE_API,
  TIPOS_DE_EVENTO,
  TIPOS_DE_VINDA,
} from '../../compartilhado/vocabulario'

// O modelo de dados da agenda (docs/modelo-de-dados.md), no esquema `agenda` do
// Postgres do projeto do CRM (ADR 0001). Só a agenda escreve aqui, e a agenda não
// lê as tabelas do CRM: o que ela precisa de lá vem pela API. As migrações saem
// daqui com `npm run db:gerar`.
//
// O que não pode quebrar fica numa restrição do banco, não só no código:
//   · tudo da mesma clínica (chaves estrangeiras compostas com clinica_id);
//   · a cadeira da consulta é da unidade da consulta;
//   · valores de lista fechada (check a partir do vocabulário compartilhado);
//   · o profissional, a cadeira e o paciente sem duas consultas no mesmo horário,
//     e os expedientes sem se cruzar: restrições de exclusão que o Drizzle não
//     descreve, escritas à mão em drizzle/0001_regras_de_horario.sql;
//   · o histórico só com inserção (gatilho, na mesma migração).
//
// Todas as tabelas têm RLS ligado e nenhuma política: só o nosso servidor, com a
// conexão direta, lê e grava.

export const agenda = pgSchema('agenda')

/** `coluna in ('a', 'b')` (ou `in (5, 10)`) a partir de uma lista do vocabulário. */
function emLista(coluna: AnyPgColumn, valores: readonly (string | number)[]): SQL {
  return sql`${coluna} in (${sql.raw(valores.map((v) => (typeof v === 'number' ? String(v) : `'${v}'`)).join(', '))})`
}

const criadoEm = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const atualizadoEm = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
const instante = () => timestamp({ withTimezone: true })

// ── Clínica e acesso ─────────────────────────────────────────────────────────

export const clinicas = agenda
  .table(
    'clinicas',
    {
      id: uuid().primaryKey().defaultRandom(),
      /** A conta na plataforma: o {{companyId}} da URL do app, e o X-Clinica nas chamadas ao CRM. */
      company_id: uuid().notNull().unique(),
      nome: text().notNull(),
      ativa: boolean().notNull().default(true),
      /** Os expedientes e os horários livres são calculados neste fuso. */
      fuso_horario: text().notNull().default('America/Sao_Paulo'),
      /** De quanto em quanto tempo a grade oferece um início. A duração vem do procedimento. */
      cadencia_minutos: integer().notNull().default(30),
      /** Token da API da plataforma, cifrado pelo app com uma chave do .env. */
      token_plataforma_cifrado: text(),
      /** O número que envia a confirmação e o lembrete, só dígitos com o país. */
      remetente: text(),
      confirmacao_modelo_id: text(),
      confirmacao_modelo_nome: text(),
      /** O lembrete, quando a clínica escolhe que ele sai pela agenda (a escolha mora no CRM). */
      lembrete_modelo_id: text(),
      lembrete_modelo_nome: text(),
      lembrete_antecedencia_horas: integer().notNull().default(24),
      sincronizar_contatos: boolean().notNull().default(true),
      /** A etiqueta que o contato ganha na plataforma em cada status; vazio não etiqueta. */
      etiqueta_agendou_id: text(),
      etiqueta_compareceu_id: text(),
      etiqueta_faltou_id: text(),
      /** Só manda avisos ao CRM quando ligada. */
      ligada_ao_crm: boolean().notNull().default(false),
      /** O webhook que a agenda cadastrou no CRM para esta clínica (fase 7b), e o segredo dele, cifrado. */
      crm_webhook_id: text(),
      crm_webhook_segredo_cifrado: text(),
      /**
       * O procedimento da consulta que o CRM marca fora da agenda; sem ele, a vinda
       * espera a recepção. Sem chave estrangeira (procedimentos aponta para clinicas,
       * e o ciclo confunde os tipos do Drizzle): quem grava confere que é da clínica,
       * e procedimento não se apaga, só se desativa.
       */
      procedimento_das_vindas_id: uuid(),
      criado_em: criadoEm(),
      atualizado_em: atualizadoEm(),
    },
    (t) => [
      check('clinicas_cadencia', emLista(t.cadencia_minutos, CADENCIAS_DA_GRADE)),
      check('clinicas_antecedencia_do_lembrete', sql`${t.lembrete_antecedencia_horas} between 1 and 168`),
    ]
  )
  .enableRLS()

export const usuarios = agenda
  .table(
    'usuarios',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      /** O {{userId}} da plataforma: id do usuário, nunca o do atendente (como no CRM). */
      usuario_plataforma_id: uuid().notNull(),
      nome: text().notNull(),
      email: text(),
      gestor: boolean().notNull().default(false),
      recepcao: boolean().notNull().default(false),
      dentista: boolean().notNull().default(false),
      ativo: boolean().notNull().default(true),
      criado_em: criadoEm(),
      atualizado_em: atualizadoEm(),
    },
    (t) => [
      uniqueIndex('usuarios_por_plataforma').on(t.clinica_id, t.usuario_plataforma_id),
      unique('usuarios_da_clinica').on(t.clinica_id, t.id),
      check('usuarios_com_papel', sql`${t.gestor} or ${t.recepcao} or ${t.dentista}`),
    ]
  )
  .enableRLS()

/** As chaves do agente de IA e das integrações. Cada uma é de uma clínica só. */
export const chavesApi = agenda
  .table(
    'chaves_api',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      nome: text().notNull(),
      tipo: text().notNull(),
      prefixo: text().notNull(),
      /** É por ele que a API acha a chave. */
      hash: text().notNull().unique(),
      /** Para a equipe copiar a chave de novo, como no CRM. */
      chave_cifrada: text(),
      pode_escrever: boolean().notNull().default(false),
      criado_em: criadoEm(),
      ultimo_uso_em: instante(),
      revogada_em: instante(),
    },
    (t) => [index('chaves_api_da_clinica').on(t.clinica_id), check('chaves_api_tipo', emLista(t.tipo, TIPOS_DE_CHAVE_API))]
  )
  .enableRLS()

// ── A clínica por dentro ─────────────────────────────────────────────────────

/** Toda clínica tem pelo menos uma: a consulta acontece numa unidade. Não se apaga, se desativa. */
export const unidades = agenda
  .table(
    'unidades',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      nome: text().notNull(),
      endereco: text(),
      telefone: text(),
      ativa: boolean().notNull().default(true),
      /** A unidade correspondente no CRM, para o card nascer nela; vazia vai para "Sem unidade". */
      crm_unidade_id: uuid(),
      criado_em: criadoEm(),
    },
    (t) => [
      uniqueIndex('unidades_nome').on(t.clinica_id, sql`lower(${t.nome})`),
      unique('unidades_da_clinica').on(t.clinica_id, t.id),
    ]
  )
  .enableRLS()

/** As unidades que cada usuário enxerga. Sem nenhuma linha, vê todas; o gestor sempre vê todas. */
export const usuarioUnidades = agenda
  .table(
    'usuario_unidades',
    {
      clinica_id: uuid().notNull(),
      usuario_id: uuid().notNull(),
      unidade_id: uuid().notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.usuario_id, t.unidade_id] }),
      foreignKey({ name: 'usuario_unidades_usuario_da_clinica', columns: [t.clinica_id, t.usuario_id], foreignColumns: [usuarios.clinica_id, usuarios.id] }),
      foreignKey({ name: 'usuario_unidades_unidade_da_clinica', columns: [t.clinica_id, t.unidade_id], foreignColumns: [unidades.clinica_id, unidades.id] }),
    ]
  )
  .enableRLS()

export const cadeiras = agenda
  .table(
    'cadeiras',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid().notNull(),
      unidade_id: uuid().notNull(),
      nome: text().notNull(),
      ativa: boolean().notNull().default(true),
      criado_em: criadoEm(),
    },
    (t) => [
      uniqueIndex('cadeiras_nome').on(t.unidade_id, sql`lower(${t.nome})`),
      /** A consulta aponta para a cadeira pela unidade: a cadeira é sempre da unidade da consulta. */
      unique('cadeiras_da_unidade').on(t.clinica_id, t.unidade_id, t.id),
      foreignKey({ name: 'cadeiras_unidade_da_clinica', columns: [t.clinica_id, t.unidade_id], foreignColumns: [unidades.clinica_id, unidades.id] }),
    ]
  )
  .enableRLS()

export const especialidades = agenda
  .table(
    'especialidades',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      nome: text().notNull(),
      criado_em: criadoEm(),
    },
    (t) => [
      uniqueIndex('especialidades_nome').on(t.clinica_id, sql`lower(${t.nome})`),
      unique('especialidades_da_clinica').on(t.clinica_id, t.id),
    ]
  )
  .enableRLS()

export const procedimentos = agenda
  .table(
    'procedimentos',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      nome: text().notNull(),
      /** A duração da consulta; quem agenda pode mudar a de uma consulta. */
      duracao_minutos: integer().notNull(),
      cor: text().notNull().default('#10B981'),
      /** Vazia: qualquer profissional faz. */
      especialidade_id: uuid(),
      ativo: boolean().notNull().default(true),
      criado_em: criadoEm(),
      atualizado_em: atualizadoEm(),
    },
    (t) => [
      uniqueIndex('procedimentos_nome').on(t.clinica_id, sql`lower(${t.nome})`),
      unique('procedimentos_da_clinica').on(t.clinica_id, t.id),
      foreignKey({
        name: 'procedimentos_especialidade_da_clinica',
        columns: [t.clinica_id, t.especialidade_id],
        foreignColumns: [especialidades.clinica_id, especialidades.id],
      }),
      check('procedimentos_duracao', sql`${t.duracao_minutos} between 5 and 480`),
    ]
  )
  .enableRLS()

// ── Profissionais ────────────────────────────────────────────────────────────

/** Quem atende. Tem usuário quando entra na agenda pela plataforma; sem usuário, recebe consultas do mesmo jeito. */
export const profissionais = agenda
  .table(
    'profissionais',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      nome: text().notNull(),
      cro: text(),
      cor: text().notNull().default('#3B82F6'),
      usuario_id: uuid(),
      /** O dentista no prontuário (a Clinicorp), para a consulta que o CRM marca lá entrar sozinha aqui. */
      id_no_prontuario: text(),
      ativo: boolean().notNull().default(true),
      criado_em: criadoEm(),
      atualizado_em: atualizadoEm(),
    },
    (t) => [
      unique('profissionais_da_clinica').on(t.clinica_id, t.id),
      uniqueIndex('profissionais_no_prontuario').on(t.clinica_id, t.id_no_prontuario).where(sql`${t.id_no_prontuario} is not null`),
      /** Um usuário é no máximo um profissional. */
      uniqueIndex('profissionais_usuario').on(t.clinica_id, t.usuario_id).where(sql`${t.usuario_id} is not null`),
      foreignKey({ name: 'profissionais_usuario_da_clinica', columns: [t.clinica_id, t.usuario_id], foreignColumns: [usuarios.clinica_id, usuarios.id] }),
    ]
  )
  .enableRLS()

export const profissionalEspecialidades = agenda
  .table(
    'profissional_especialidades',
    {
      clinica_id: uuid().notNull(),
      profissional_id: uuid().notNull(),
      especialidade_id: uuid().notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.profissional_id, t.especialidade_id] }),
      foreignKey({
        name: 'profissional_especialidades_profissional_da_clinica',
        columns: [t.clinica_id, t.profissional_id],
        foreignColumns: [profissionais.clinica_id, profissionais.id],
      }),
      foreignKey({
        name: 'profissional_especialidades_especialidade_da_clinica',
        columns: [t.clinica_id, t.especialidade_id],
        foreignColumns: [especialidades.clinica_id, especialidades.id],
      }),
    ]
  )
  .enableRLS()

/** Onde o profissional atende, com a prioridade dele ali (menor vem primeiro). */
export const profissionalUnidades = agenda
  .table(
    'profissional_unidades',
    {
      clinica_id: uuid().notNull(),
      profissional_id: uuid().notNull(),
      unidade_id: uuid().notNull(),
      prioridade: integer().notNull().default(100),
    },
    (t) => [
      primaryKey({ columns: [t.profissional_id, t.unidade_id] }),
      unique('profissional_unidades_da_clinica').on(t.clinica_id, t.profissional_id, t.unidade_id),
      foreignKey({
        name: 'profissional_unidades_profissional_da_clinica',
        columns: [t.clinica_id, t.profissional_id],
        foreignColumns: [profissionais.clinica_id, profissionais.id],
      }),
      foreignKey({ name: 'profissional_unidades_unidade_da_clinica', columns: [t.clinica_id, t.unidade_id], foreignColumns: [unidades.clinica_id, unidades.id] }),
      check('profissional_unidades_prioridade', sql`${t.prioridade} >= 0`),
    ]
  )
  .enableRLS()

/**
 * Os horários de trabalho, no fuso da clínica. Pode haver mais de um intervalo no
 * mesmo dia; os do mesmo profissional nunca se cruzam (restrição de exclusão na
 * migração 0001).
 */
export const expedientes = agenda
  .table(
    'expedientes',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid().notNull(),
      profissional_id: uuid().notNull(),
      unidade_id: uuid().notNull(),
      /** 0 (domingo) a 6 (sábado). */
      dia_semana: smallint().notNull(),
      inicio: time().notNull(),
      fim: time().notNull(),
    },
    (t) => [
      index('expedientes_do_profissional').on(t.profissional_id, t.dia_semana),
      foreignKey({
        name: 'expedientes_onde_o_profissional_atende',
        columns: [t.clinica_id, t.profissional_id, t.unidade_id],
        foreignColumns: [profissionalUnidades.clinica_id, profissionalUnidades.profissional_id, profissionalUnidades.unidade_id],
      }).onDelete('cascade'),
      check('expedientes_dia_semana', sql`${t.dia_semana} between 0 and 6`),
      check('expedientes_fim_depois_do_inicio', sql`${t.fim} > ${t.inicio}`),
    ]
  )
  .enableRLS()

/** Quando o profissional não atende fora do padrão. Sem repetição: o intervalo de todo dia se faz partindo o expediente. */
export const bloqueios = agenda
  .table(
    'bloqueios',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid().notNull(),
      profissional_id: uuid().notNull(),
      /** Vazia: vale para todas as unidades. */
      unidade_id: uuid(),
      inicio: timestamp({ withTimezone: true }).notNull(),
      fim: timestamp({ withTimezone: true }).notNull(),
      tipo: text().notNull(),
      motivo: text(),
      criado_por_id: uuid(),
      criado_em: criadoEm(),
    },
    (t) => [
      index('bloqueios_do_profissional').on(t.profissional_id, t.inicio),
      foreignKey({ name: 'bloqueios_profissional_da_clinica', columns: [t.clinica_id, t.profissional_id], foreignColumns: [profissionais.clinica_id, profissionais.id] }),
      foreignKey({ name: 'bloqueios_unidade_da_clinica', columns: [t.clinica_id, t.unidade_id], foreignColumns: [unidades.clinica_id, unidades.id] }),
      foreignKey({ name: 'bloqueios_autor_da_clinica', columns: [t.clinica_id, t.criado_por_id], foreignColumns: [usuarios.clinica_id, usuarios.id] }),
      check('bloqueios_tipo', emLista(t.tipo, TIPOS_DE_BLOQUEIO)),
      check('bloqueios_fim_depois_do_inicio', sql`${t.fim} > ${t.inicio}`),
    ]
  )
  .enableRLS()

// ── Pacientes e consultas ────────────────────────────────────────────────────

/** O telefone pode repetir na clínica: a mãe marca para o filho com o número dela (decisão D1). */
export const pacientes = agenda
  .table(
    'pacientes',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      nome: text().notNull(),
      /** E.164, como no CRM. */
      telefone: text(),
      email: text(),
      nascimento: date(),
      observacoes: text(),
      /** O contato na plataforma, quando achado. */
      contato_plataforma_id: uuid(),
      criado_em: criadoEm(),
      atualizado_em: atualizadoEm(),
    },
    (t) => [
      index('pacientes_telefone').on(t.clinica_id, t.telefone),
      unique('pacientes_da_clinica').on(t.clinica_id, t.id),
      check('pacientes_telefone_e164', sql`${t.telefone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    ]
  )
  .enableRLS()

/**
 * A consulta. As que ocupam o horário (STATUS_QUE_OCUPAM_HORARIO) não se cruzam
 * por profissional, cadeira nem paciente: restrições de exclusão na migração 0001.
 */
export const consultas = agenda
  .table(
    'consultas',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid().notNull(),
      unidade_id: uuid().notNull(),
      cadeira_id: uuid().notNull(),
      profissional_id: uuid().notNull(),
      paciente_id: uuid().notNull(),
      procedimento_id: uuid().notNull(),
      inicio: timestamp({ withTimezone: true }).notNull(),
      fim: timestamp({ withTimezone: true }).notNull(),
      status: text().notNull().default('agendada'),
      observacoes: text(),
      criada_por_tipo: text().notNull(),
      criada_por_id: uuid(),
      cancelada_em: instante(),
      motivo_cancelamento: text(),
      /** O card do paciente no CRM, que o worker guarda na primeira entrega. */
      crm_card_id: uuid(),
      /** A mensagem agendada na plataforma, quando o lembrete sai pela agenda. */
      lembrete_mensagem_id: text(),
      /** Controle de edição simultânea, como o card do CRM. */
      versao: integer().notNull().default(1),
      criado_em: criadoEm(),
      atualizado_em: atualizadoEm(),
    },
    (t) => [
      index('consultas_por_dia').on(t.clinica_id, t.inicio),
      index('consultas_do_profissional').on(t.profissional_id, t.inicio),
      index('consultas_da_cadeira').on(t.cadeira_id, t.inicio),
      index('consultas_do_paciente').on(t.paciente_id, t.inicio),
      unique('consultas_da_clinica').on(t.clinica_id, t.id),
      foreignKey({
        name: 'consultas_cadeira_da_unidade',
        columns: [t.clinica_id, t.unidade_id, t.cadeira_id],
        foreignColumns: [cadeiras.clinica_id, cadeiras.unidade_id, cadeiras.id],
      }),
      foreignKey({ name: 'consultas_profissional_da_clinica', columns: [t.clinica_id, t.profissional_id], foreignColumns: [profissionais.clinica_id, profissionais.id] }),
      foreignKey({ name: 'consultas_paciente_da_clinica', columns: [t.clinica_id, t.paciente_id], foreignColumns: [pacientes.clinica_id, pacientes.id] }),
      foreignKey({ name: 'consultas_procedimento_da_clinica', columns: [t.clinica_id, t.procedimento_id], foreignColumns: [procedimentos.clinica_id, procedimentos.id] }),
      check('consultas_status', emLista(t.status, STATUS_DA_CONSULTA)),
      check('consultas_criada_por', emLista(t.criada_por_tipo, TIPOS_DE_ATOR)),
      check('consultas_fim_depois_do_inicio', sql`${t.fim} > ${t.inicio}`),
      check('consultas_cancelada_com_data', sql`(${t.status} = 'cancelada') = (${t.cancelada_em} is not null)`),
      check('consultas_versao', sql`${t.versao} >= 1`),
    ]
  )
  .enableRLS()

// ── Histórico e caixa de saída ───────────────────────────────────────────────

/** O histórico da agenda. Só aceita inserção (gatilho na migração 0001). */
export const eventos = agenda
  .table(
    'eventos',
    {
      id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      consulta_id: uuid(),
      paciente_id: uuid(),
      tipo: text().notNull(),
      /** O que mudou: campo, antes, depois, motivo. */
      dados: jsonb().notNull().default({}),
      ator_tipo: text().notNull(),
      ator_id: uuid(),
      ocorrido_em: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      index('eventos_da_consulta').on(t.consulta_id, t.id),
      index('eventos_do_paciente').on(t.paciente_id, t.id),
      index('eventos_da_clinica').on(t.clinica_id, t.id),
      foreignKey({ name: 'eventos_consulta_da_clinica', columns: [t.clinica_id, t.consulta_id], foreignColumns: [consultas.clinica_id, consultas.id] }),
      foreignKey({ name: 'eventos_paciente_da_clinica', columns: [t.clinica_id, t.paciente_id], foreignColumns: [pacientes.clinica_id, pacientes.id] }),
      check('eventos_tipo', emLista(t.tipo, TIPOS_DE_EVENTO)),
      check('eventos_ator', emLista(t.ator_tipo, TIPOS_DE_ATOR)),
      check('eventos_de_alguem', sql`${t.consulta_id} is not null or ${t.paciente_id} is not null`),
    ]
  )
  .enableRLS()

/**
 * O que a agenda precisa avisar ao CRM e fazer na plataforma. O caso de uso grava
 * o aviso na mesma transação da consulta, e o worker entrega na ordem do `id`,
 * com novas tentativas: se a consulta foi gravada, o aviso sai.
 */
export const caixaDeSaida = agenda
  .table(
    'caixa_de_saida',
    {
      /** Sequencial: a ordem de entrega. */
      id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      destino: text().notNull(),
      tipo: text().notNull(),
      consulta_id: uuid(),
      paciente_id: uuid(),
      /** O que a entrega precisa, copiado na hora (telefone, nome, data, unidade). */
      dados: jsonb().notNull().default({}),
      situacao: text().notNull().default('pendente'),
      tentativas: integer().notNull().default(0),
      proxima_tentativa_em: timestamp({ withTimezone: true }).notNull().defaultNow(),
      ultimo_erro: text(),
      /** O que voltou: o id do card, o id da mensagem. */
      resultado: jsonb(),
      criado_em: criadoEm(),
      concluido_em: instante(),
    },
    (t) => [
      index('caixa_de_saida_pendentes')
        .on(t.proxima_tentativa_em, t.id)
        .where(sql`${t.situacao} = 'pendente'`),
      index('caixa_de_saida_da_consulta').on(t.consulta_id, t.id),
      foreignKey({ name: 'caixa_de_saida_consulta_da_clinica', columns: [t.clinica_id, t.consulta_id], foreignColumns: [consultas.clinica_id, consultas.id] }),
      foreignKey({ name: 'caixa_de_saida_paciente_da_clinica', columns: [t.clinica_id, t.paciente_id], foreignColumns: [pacientes.clinica_id, pacientes.id] }),
      check('caixa_de_saida_destino', emLista(t.destino, DESTINOS_DE_AVISO)),
      check(
        'caixa_de_saida_tipo_do_destino',
        sql`(${t.destino} = 'crm' and ${emLista(t.tipo, AVISOS_AO_CRM)}) or (${t.destino} = 'plataforma' and ${emLista(t.tipo, ACOES_NA_PLATAFORMA)})`
      ),
      check('caixa_de_saida_situacao', emLista(t.situacao, SITUACOES_DE_AVISO)),
      check('caixa_de_saida_tentativas', sql`${t.tentativas} >= 0`),
    ]
  )
  .enableRLS()

// ── Entrada do CRM (fase 7b) ─────────────────────────────────────────────────

/**
 * Os avisos que o webhook do CRM mandou. A rota guarda e responde na hora; o
 * worker processa. O repetido (a mesma entrega, de novo) é ignorado pelo número.
 */
export const entradasDoCrm = agenda
  .table(
    'entradas_do_crm',
    {
      id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      /** O número da entrega no CRM (o `id` do corpo). */
      entrega_id: bigint({ mode: 'number' }).notNull(),
      evento: text().notNull(),
      tipo: text().notNull(),
      crm_card_id: uuid(),
      corpo: jsonb().notNull(),
      situacao: text().notNull().default('pendente'),
      tentativas: integer().notNull().default(0),
      proxima_tentativa_em: timestamp({ withTimezone: true }).notNull().defaultNow(),
      ultimo_erro: text(),
      /** O que o processamento fez, ou por que ignorou. */
      resultado: jsonb(),
      recebido_em: criadoEm(),
      processado_em: instante(),
    },
    (t) => [
      unique('entradas_do_crm_entrega').on(t.clinica_id, t.entrega_id),
      index('entradas_do_crm_pendentes')
        .on(t.proxima_tentativa_em, t.id)
        .where(sql`${t.situacao} = 'pendente'`),
      index('entradas_do_crm_do_card').on(t.crm_card_id, t.id),
      check('entradas_do_crm_situacao', emLista(t.situacao, SITUACOES_DE_ENTRADA)),
      check('entradas_do_crm_tentativas', sql`${t.tentativas} >= 0`),
    ]
  )
  .enableRLS()

/**
 * A consulta que o CRM marcou fora da agenda (a CRC na Clinicorp, o botão, a IA)
 * e que ainda não virou consulta aqui: falta o vínculo do dentista, a cadeira, o
 * procedimento... A recepção encaixa ou descarta. Uma pendente por card.
 */
export const vindasDoCrm = agenda
  .table(
    'vindas_do_crm',
    {
      id: uuid().primaryKey().defaultRandom(),
      clinica_id: uuid()
        .notNull()
        .references(() => clinicas.id),
      crm_card_id: uuid().notNull(),
      tipo: text().notNull().default('marcar'),
      situacao: text().notNull().default('pendente'),
      /** A unidade da agenda ligada à do card; vazia quando a do CRM não tem par aqui. */
      unidade_id: uuid(),
      nome: text(),
      telefone: text().notNull(),
      inicio: timestamp({ withTimezone: true }).notNull(),
      fim: instante(),
      /** O dentista no prontuário, quando o CRM marcou na Clinicorp. */
      profissional_no_prontuario_id: text(),
      profissional_no_prontuario_nome: text(),
      /** Por que não entrou sozinha: o código do que faltou. */
      motivo: text(),
      /** Na remarcação, a consulta ligada ao card; na encaixada, a consulta que nasceu. */
      consulta_id: uuid(),
      resolvida_por_tipo: text(),
      resolvida_por_id: uuid(),
      resolvida_em: instante(),
      criado_em: criadoEm(),
      atualizado_em: atualizadoEm(),
    },
    (t) => [
      unique('vindas_do_crm_da_clinica').on(t.clinica_id, t.id),
      uniqueIndex('vindas_do_crm_pendente_do_card')
        .on(t.clinica_id, t.crm_card_id)
        .where(sql`${t.situacao} = 'pendente'`),
      index('vindas_do_crm_pendentes').on(t.clinica_id, t.inicio).where(sql`${t.situacao} = 'pendente'`),
      foreignKey({ name: 'vindas_do_crm_unidade_da_clinica', columns: [t.clinica_id, t.unidade_id], foreignColumns: [unidades.clinica_id, unidades.id] }),
      foreignKey({ name: 'vindas_do_crm_consulta_da_clinica', columns: [t.clinica_id, t.consulta_id], foreignColumns: [consultas.clinica_id, consultas.id] }),
      check('vindas_do_crm_tipo', emLista(t.tipo, TIPOS_DE_VINDA)),
      check('vindas_do_crm_situacao', emLista(t.situacao, SITUACOES_DA_VINDA)),
      check('vindas_do_crm_resolvida_por', sql`${t.resolvida_por_tipo} is null or ${emLista(t.resolvida_por_tipo, TIPOS_DE_ATOR)}`),
      check('vindas_do_crm_telefone_e164', sql`${t.telefone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    ]
  )
  .enableRLS()
