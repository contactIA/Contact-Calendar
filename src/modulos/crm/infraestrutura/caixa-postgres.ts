import { and, eq, sql } from 'drizzle-orm'
import type { AvisoAoCrm } from '@/compartilhado/vocabulario'
import type { Banco } from '@/infra/banco/conexao'
import { caixaDeSaida, consultas } from '@/infra/banco/esquema'
import type { CaixaDoCrm } from '../aplicacao/portas'

// Os avisos ao CRM na caixa de saída (agenda.caixa_de_saida, destino `crm`).

/** As linhas de um `execute`: o postgres-js devolve a lista; o PGlite, `{ rows }`. */
function linhas<T>(resultado: unknown): T[] {
  return Array.isArray(resultado) ? (resultado as T[]) : (resultado as { rows: T[] }).rows
}

interface Reservado {
  id: number | string
  clinica_id: string
  company_id: string
  tipo: AvisoAoCrm
  consulta_id: string | null
  tentativas: number
  criado_em: string | Date
  dados: { telefone: string; nome: string; inicio: string; unidadeCrmId: string | null }
  crm_card_id: string | null
  proxima_consulta: string | Date | null
}

export function caixaDoCrmPostgres(db: Banco): CaixaDoCrm {
  return {
    async reservar(agora, reservarAte, limite) {
      return db.transaction(async (tx) => {
        // Reserva empurrando a próxima tentativa: o aviso some da fila dos outros
        // workers até `reservarAte`, e volta sozinho se este cair no meio.
        const reservados = linhas<{ id: number | string }>(
          await tx.execute(sql`
            update agenda.caixa_de_saida set proxima_tentativa_em = ${reservarAte.toISOString()}::timestamptz
            where id in (
              select a.id from agenda.caixa_de_saida a
              where a.destino = 'crm' and a.situacao = 'pendente'
                and a.proxima_tentativa_em <= ${agora.toISOString()}::timestamptz
                and not exists (
                  select 1 from agenda.caixa_de_saida b
                  where b.destino = 'crm' and b.situacao = 'pendente' and b.consulta_id = a.consulta_id and b.id < a.id
                )
              order by a.proxima_tentativa_em, a.id
              limit ${limite}
              for update of a skip locked
            )
            returning id`)
        ).map((l) => Number(l.id))
        if (!reservados.length) return []

        const detalhes = linhas<Reservado>(
          await tx.execute(sql`
            select a.id, a.clinica_id, c.company_id, a.tipo, a.consulta_id, a.tentativas, a.criado_em, a.dados,
                   k.crm_card_id,
                   (select min(k2.inicio) from agenda.consultas k2
                      join agenda.pacientes p2 on p2.clinica_id = k2.clinica_id and p2.id = k2.paciente_id
                     where k2.clinica_id = a.clinica_id and p2.telefone = a.dados->>'telefone'
                       and k2.status in ('agendada', 'confirmada')
                       and k2.inicio > ${agora.toISOString()}::timestamptz) as proxima_consulta
              from agenda.caixa_de_saida a
              join agenda.clinicas c on c.id = a.clinica_id
              left join agenda.consultas k on k.clinica_id = a.clinica_id and k.id = a.consulta_id
             where a.id in (${sql.join(
               reservados.map((id) => sql`${id}`),
               sql`, `
             )})
             order by a.id`)
        )
        return detalhes.map((l) => ({
          id: Number(l.id),
          clinicaId: l.clinica_id,
          companyId: l.company_id,
          tipo: l.tipo,
          consultaId: l.consulta_id,
          tentativas: l.tentativas,
          criadoEm: new Date(l.criado_em),
          telefone: l.dados.telefone,
          nome: l.dados.nome,
          inicio: new Date(l.dados.inicio),
          unidadeCrmId: l.dados.unidadeCrmId ?? null,
          cardId: l.crm_card_id,
          proximaConsulta: l.proxima_consulta ? new Date(l.proxima_consulta) : null,
        }))
      })
    },

    async concluir(aviso, agora, resultado) {
      await db.transaction(async (tx) => {
        await tx
          .update(caixaDeSaida)
          .set({ situacao: 'concluido', concluido_em: agora, tentativas: aviso.tentativas + 1, resultado, ultimo_erro: null })
          .where(eq(caixaDeSaida.id, aviso.id))
        // O card é do worker: a consulta guarda sem mudar a versão, para não atrapalhar quem a edita.
        if (aviso.consultaId && resultado.cardId) {
          await tx
            .update(consultas)
            .set({ crm_card_id: resultado.cardId })
            .where(and(eq(consultas.clinica_id, aviso.clinicaId), eq(consultas.id, aviso.consultaId)))
        }
      })
    },

    async adiar(id, tentativas, proxima, erro) {
      await db.update(caixaDeSaida).set({ tentativas, proxima_tentativa_em: proxima, ultimo_erro: erro }).where(eq(caixaDeSaida.id, id))
    },

    async desistir(id, tentativas, erro) {
      await db.update(caixaDeSaida).set({ situacao: 'falhou', tentativas, ultimo_erro: erro }).where(eq(caixaDeSaida.id, id))
    },
  }
}
