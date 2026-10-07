import type { PGlite } from '@electric-sql/pglite'
import type { Acesso } from '@/modulos/acesso/aplicacao/acesso'

// Uma clínica pronta para agendar, no banco de teste:
//   · unidade Centro, com Consultório 1 e 2; unidade Bairro, onde a Ana também atende;
//   · Dra. Ana (Ortodontia, prioridade 1) e Dr. Bruno (prioridade 2), de segunda a
//     sexta das 8h às 12h e das 14h às 18h no Centro;
//   · Avaliação (60 min, qualquer um faz) e Aparelho (60 min, só Ortodontia);
//   · ligada ao CRM, com confirmação, lembrete e as três etiquetas configuradas;
//   · os acessos da recepção, da Dra. Ana como dentista e da chave do agente de IA.

export async function montarClinicaDaAgenda(pg: PGlite, configuracao: { ligadaAoCrm?: boolean } = {}) {
  const id = async (sql: string, params: unknown[]) => (await pg.query<{ id: string }>(sql + ' returning id', params)).rows[0]!.id
  const clinica = await id(
    `insert into agenda.clinicas (company_id, nome, ligada_ao_crm, confirmacao_modelo_id, lembrete_modelo_id, etiqueta_agendou_id, etiqueta_compareceu_id, etiqueta_faltou_id)
     values ($1, 'Clínica Sorriso', $2, 'modelo-confirmacao', 'modelo-lembrete', 'etiqueta-agendou', 'etiqueta-compareceu', 'etiqueta-faltou')`,
    [crypto.randomUUID(), configuracao.ligadaAoCrm ?? true]
  )
  const centro = await id(`insert into agenda.unidades (clinica_id, nome, crm_unidade_id) values ($1, 'Centro', $2)`, [clinica, crypto.randomUUID()])
  const bairro = await id(`insert into agenda.unidades (clinica_id, nome) values ($1, 'Bairro')`, [clinica])
  const consultorio1 = await id(`insert into agenda.cadeiras (clinica_id, unidade_id, nome) values ($1, $2, 'Consultório 1')`, [clinica, centro])
  const consultorio2 = await id(`insert into agenda.cadeiras (clinica_id, unidade_id, nome) values ($1, $2, 'Consultório 2')`, [clinica, centro])
  const ortodontia = await id(`insert into agenda.especialidades (clinica_id, nome) values ($1, 'Ortodontia')`, [clinica])
  const avaliacao = await id(`insert into agenda.procedimentos (clinica_id, nome, duracao_minutos) values ($1, 'Avaliação', 60)`, [clinica])
  const aparelho = await id(`insert into agenda.procedimentos (clinica_id, nome, duracao_minutos, especialidade_id) values ($1, 'Aparelho', 60, $2)`, [clinica, ortodontia])
  const usuarioAna = await id(`insert into agenda.usuarios (clinica_id, usuario_plataforma_id, nome, dentista) values ($1, $2, 'Dra. Ana', true)`, [clinica, crypto.randomUUID()])
  const recepcionista = await id(`insert into agenda.usuarios (clinica_id, usuario_plataforma_id, nome, recepcao) values ($1, $2, 'Rita', true)`, [clinica, crypto.randomUUID()])
  const ana = await id(`insert into agenda.profissionais (clinica_id, nome, usuario_id) values ($1, 'Dra. Ana', $2)`, [clinica, usuarioAna])
  const bruno = await id(`insert into agenda.profissionais (clinica_id, nome) values ($1, 'Dr. Bruno')`, [clinica])
  await pg.query(`insert into agenda.profissional_especialidades (clinica_id, profissional_id, especialidade_id) values ($1, $2, $3)`, [clinica, ana, ortodontia])
  for (const [profissional, unidade, prioridade] of [
    [ana, centro, 1],
    [bruno, centro, 2],
    [ana, bairro, 1],
  ] as const) {
    await pg.query(`insert into agenda.profissional_unidades (clinica_id, profissional_id, unidade_id, prioridade) values ($1, $2, $3, $4)`, [clinica, profissional, unidade, prioridade])
  }
  for (const profissional of [ana, bruno]) {
    for (let dia = 1; dia <= 5; dia++) {
      for (const [inicio, fim] of [
        ['08:00', '12:00'],
        ['14:00', '18:00'],
      ]) {
        await pg.query(`insert into agenda.expedientes (clinica_id, profissional_id, unidade_id, dia_semana, inicio, fim) values ($1, $2, $3, $4, $5, $6)`, [
          clinica,
          profissional,
          centro,
          dia,
          inicio,
          fim,
        ])
      }
    }
  }

  const recepcao: Acesso = {
    tipo: 'usuario',
    clinicaId: clinica,
    usuarioId: recepcionista,
    nome: 'Rita',
    papeis: { gestor: false, recepcao: true, dentista: false },
    profissionalId: null,
  }
  const dentistaAna: Acesso = {
    tipo: 'usuario',
    clinicaId: clinica,
    usuarioId: usuarioAna,
    nome: 'Dra. Ana',
    papeis: { gestor: false, recepcao: false, dentista: true },
    profissionalId: ana,
  }
  const ia: Acesso = { tipo: 'ia', clinicaId: clinica, chaveId: crypto.randomUUID(), nome: 'Agente', podeEscrever: true }

  return { clinica, centro, bairro, consultorio1, consultorio2, ortodontia, avaliacao, aparelho, ana, bruno, recepcao, dentistaAna, ia }
}

export type ClinicaDaAgenda = Awaited<ReturnType<typeof montarClinicaDaAgenda>>
