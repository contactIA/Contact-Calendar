import type { Relogio } from '@/compartilhado/relogio'
import { cardFora, ETAPAS_DO_CRM, nadaAFazer, passoDoAviso, proximaTentativa, vaiPassarSozinho } from '../dominio/entrega'
import type { ApiDoCrm, AvisoAoCrmReservado, CaixaDoCrm, ResultadoDaEntrega } from './portas'

// A saída da agenda para o CRM (ADR 0001, fase 7): o worker entrega os avisos
// que os casos de uso da agenda gravaram na caixa de saída, na mesma transação da
// consulta. Repetir não estraga: o CRM ignora o card que já está onde deveria, e
// as recusas de "já feito" encerram a entrega.

/** Quanto tempo o aviso fica reservado para um worker, antes de outro poder pegá-lo. */
const RESERVA_MS = 2 * 60_000

export interface DependenciasDoCrm {
  caixa: CaixaDoCrm
  /** Sem a chave do CRM no .env, a entrega não roda e os avisos esperam. */
  api: ApiDoCrm | null
  relogio: Relogio
}

export function casosDoCrm({ caixa, api, relogio }: DependenciasDoCrm) {
  async function executar(api: ApiDoCrm, aviso: AvisoAoCrmReservado): Promise<ResultadoDaEntrega> {
    const { companyId } = aviso
    const passo = passoDoAviso(aviso.tipo, aviso.inicio, aviso.proximaConsulta)

    if (passo.tipo === 'agendar') {
      const agendados = ETAPAS_DO_CRM.agendados
      if (aviso.cardId) {
        try {
          await api.mover(companyId, aviso.cardId, { etapa: agendados, agendadoPara: passo.agendadoPara })
          return { cardId: aviso.cardId }
        } catch (erro) {
          if (nadaAFazer(erro)) return { cardId: aviso.cardId, ignorado: erro.codigo! }
          if (!cardFora(erro)) throw erro
        }
      }
      const card = await api.criarCard(companyId, { telefone: aviso.telefone, nome: aviso.nome, unidadeId: aviso.unidadeCrmId, etapa: agendados })
      if (card.etapa === agendados && card.agendadoPara?.getTime() === passo.agendadoPara.getTime()) return { cardId: card.id }
      try {
        // O card que entra agora em Agendados leva a hora real do agendamento, se a entrega atrasou.
        await api.mover(companyId, card.id, {
          etapa: agendados,
          agendadoPara: passo.agendadoPara,
          ...(card.etapa !== agendados ? { agendadoEm: aviso.criadoEm } : {}),
        })
      } catch (erro) {
        if (nadaAFazer(erro)) return { cardId: card.id, ignorado: erro.codigo! }
        throw erro
      }
      return { cardId: card.id }
    }

    const cardId = aviso.cardId ?? (await api.cardAbertoDoContato(companyId, aviso.telefone))?.id
    if (!cardId) return { cardId: null, ignorado: 'SEM_CARD_ABERTO' }
    try {
      if (passo.tipo === 'compareceu') await api.compareceu(companyId, cardId)
      else await api.mover(companyId, cardId, { etapa: passo.etapa })
    } catch (erro) {
      if (nadaAFazer(erro) || cardFora(erro)) return { cardId, ignorado: erro.codigo! }
      throw erro
    }
    return { cardId }
  }

  return {
    /** Entrega os avisos vencidos. Devolve quantos tentou. */
    async entregarPendentes(limite = 20): Promise<{ total: number; entregues: number; adiados: number; desistidos: number }> {
      const contagem = { total: 0, entregues: 0, adiados: 0, desistidos: 0 }
      if (!api) return contagem
      const agora = relogio.agora()
      const avisos = await caixa.reservar(agora, new Date(agora.getTime() + RESERVA_MS), limite)
      contagem.total = avisos.length
      for (const aviso of avisos) {
        try {
          const resultado = await executar(api, aviso)
          await caixa.concluir(aviso, relogio.agora(), resultado)
          contagem.entregues++
        } catch (erro) {
          const tentativas = aviso.tentativas + 1
          const texto = erro instanceof Error ? erro.message : String(erro)
          const proxima = vaiPassarSozinho(erro) ? proximaTentativa(tentativas, relogio.agora()) : null
          if (proxima) {
            await caixa.adiar(aviso.id, tentativas, proxima, texto)
            contagem.adiados++
          } else {
            await caixa.desistir(aviso.id, tentativas, texto)
            contagem.desistidos++
          }
        }
      }
      return contagem
    },
  }
}
