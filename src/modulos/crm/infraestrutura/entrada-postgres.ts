import { eq, sql } from 'drizzle-orm'
import type { Banco } from '@/infra/banco/conexao'
import { decifrar, cifrar, hmac, iguaisEmTempoConstante } from '@/infra/cripto/cripto'
import { clinicas, entradasDoCrm } from '@/infra/banco/esquema'
import type { ConsultaParaConversa } from '../aplicacao/conversa'
import type { Assinador, Cifra, ClinicaNoCrm, ClinicasNoCrm, EntradasDoCrm } from '../aplicacao/portas'

// A entrada do CRM no Postgres: os avisos guardados (agenda.entradas_do_crm) e a
// ligação da clínica (as colunas crm_* de agenda.clinicas).

/** As linhas de um `execute`: o postgres-js devolve a lista; o PGlite, `{ rows }`. */
function linhas<T>(resultado: unknown): T[] {
  return Array.isArray(resultado) ? (resultado as T[]) : (resultado as { rows: T[] }).rows
}

export function entradasDoCrmPostgres(db: Banco): EntradasDoCrm {
  return {
    async guardar(clinicaId, entrada, agora) {
      const novas = await db
        .insert(entradasDoCrm)
        .values({
          clinica_id: clinicaId,
          entrega_id: entrada.entregaId,
          evento: entrada.evento,
          tipo: entrada.tipo,
          crm_card_id: entrada.cardId,
          corpo: entrada.corpo,
          recebido_em: agora,
          proxima_tentativa_em: agora,
        })
        .onConflictDoNothing({ target: [entradasDoCrm.clinica_id, entradasDoCrm.entrega_id] })
        .returning({ id: entradasDoCrm.id })
      return novas.length ? 'novo' : 'repetido'
    },

    async reservar(agora, reservarAte, limite) {
      return db.transaction(async (tx) => {
        // Um aviso de cada vez por card, na ordem em que chegaram: o seguinte só
        // sai depois que o anterior terminou.
        const reservadas = linhas<{ id: number | string }>(
          await tx.execute(sql`
            update agenda.entradas_do_crm set proxima_tentativa_em = ${reservarAte.toISOString()}::timestamptz
            where id in (
              select e.id from agenda.entradas_do_crm e
              where e.situacao = 'pendente' and e.proxima_tentativa_em <= ${agora.toISOString()}::timestamptz
                and not exists (
                  select 1 from agenda.entradas_do_crm d
                  where d.situacao = 'pendente' and d.clinica_id = e.clinica_id and d.crm_card_id = e.crm_card_id and d.id < e.id
                )
              order by e.proxima_tentativa_em, e.id
              limit ${limite}
              for update of e skip locked
            )
            returning id`)
        ).map((l) => Number(l.id))
        if (!reservadas.length) return []
        const detalhes = linhas<{ id: number | string; clinica_id: string; company_id: string; tentativas: number; corpo: unknown }>(
          await tx.execute(sql`
            select e.id, e.clinica_id, c.company_id, e.tentativas, e.corpo
              from agenda.entradas_do_crm e
              join agenda.clinicas c on c.id = e.clinica_id
             where e.id in (${sql.join(
               reservadas.map((id) => sql`${id}`),
               sql`, `
             )})
             order by e.id`)
        )
        return detalhes.map((l) => ({ id: Number(l.id), clinicaId: l.clinica_id, companyId: l.company_id, tentativas: l.tentativas, corpo: l.corpo }))
      })
    },

    async concluir(id, situacao, resultado, tentativas, agora) {
      await db.update(entradasDoCrm).set({ situacao, resultado, tentativas, processado_em: agora, ultimo_erro: null }).where(eq(entradasDoCrm.id, id))
    },

    async adiar(id, tentativas, proxima, erro) {
      await db.update(entradasDoCrm).set({ tentativas, proxima_tentativa_em: proxima, ultimo_erro: erro }).where(eq(entradasDoCrm.id, id))
    },

    async desistir(id, tentativas, erro) {
      await db.update(entradasDoCrm).set({ situacao: 'falhou', tentativas, ultimo_erro: erro }).where(eq(entradasDoCrm.id, id))
    },
  }
}

const paraClinica = (c: typeof clinicas.$inferSelect): ClinicaNoCrm => ({
  id: c.id,
  companyId: c.company_id,
  ligadaAoCrm: c.ligada_ao_crm,
  webhookId: c.crm_webhook_id,
  segredoCifrado: c.crm_webhook_segredo_cifrado,
})

export function clinicasNoCrmPostgres(db: Banco): ClinicasNoCrm {
  return {
    async obter(clinicaId) {
      const [c] = await db.select().from(clinicas).where(eq(clinicas.id, clinicaId))
      return c ? paraClinica(c) : null
    },

    async peloCompanyId(companyId) {
      // O companyId vem de um aviso ainda não conferido: só o formato de uuid chega ao banco.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) return null
      const [c] = await db.select().from(clinicas).where(eq(clinicas.company_id, companyId))
      return c ? paraClinica(c) : null
    },

    async ligar(clinicaId, webhookId, segredoCifrado) {
      await db
        .update(clinicas)
        .set({ ligada_ao_crm: true, crm_webhook_id: webhookId, crm_webhook_segredo_cifrado: segredoCifrado })
        .where(eq(clinicas.id, clinicaId))
    },

    async desligar(clinicaId) {
      await db.update(clinicas).set({ ligada_ao_crm: false, crm_webhook_id: null, crm_webhook_segredo_cifrado: null }).where(eq(clinicas.id, clinicaId))
    },
  }
}

/** O card da consulta (o que a entrega ao CRM guardou) e o telefone do paciente, para achar a conversa. */
export function consultaParaConversaPostgres(db: Banco) {
  return async (clinicaId: string, consultaId: string): Promise<ConsultaParaConversa | null> => {
    const [l] = linhas<{ company_id: string; crm_card_id: string | null; telefone: string | null }>(
      await db.execute(sql`
        select c.company_id, k.crm_card_id, p.telefone
          from agenda.consultas k
          join agenda.clinicas c on c.id = k.clinica_id
          join agenda.pacientes p on p.clinica_id = k.clinica_id and p.id = k.paciente_id
         where k.clinica_id = ${clinicaId} and k.id = ${consultaId}`)
    )
    return l ? { companyId: l.company_id, cardId: l.crm_card_id, telefone: l.telefone } : null
  }
}

/** A cifra do .env (AGENDA_CHAVE_CIFRAGEM), lida na hora de usar: sem ela, ligar e receber falham com a frase do erro. */
export const cifraDoEnv: Cifra = { cifrar: (texto) => cifrar(texto), decifrar: (guardado) => decifrar(guardado) }

export const assinadorDoCrm: Assinador = {
  hmacHex: (segredo, texto) => hmac(segredo, texto).toString('hex'),
  iguais: (a, b) => iguaisEmTempoConstante(a, b),
}
