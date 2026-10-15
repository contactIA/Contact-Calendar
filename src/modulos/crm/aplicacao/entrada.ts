import { ErroDeDominio } from '@/compartilhado/erros'
import type { Relogio } from '@/compartilhado/relogio'
import { EVENTOS_DO_CRM } from '@/compartilhado/vocabulario'
import { exigirGestor, type Acesso } from '@/modulos/acesso/aplicacao/acesso'
import type { CasosDasVindas } from '@/modulos/agenda/aplicacao/vindas'
import { assinaturaNoPrazo, lerAssinatura, lerAviso, pedidoDoAviso, saidaVale } from '../dominio/entrada'
import { proximaTentativa, vaiPassarSozinho } from '../dominio/entrega'
import type { ApiDoCrm, Assinador, Cifra, ClinicasNoCrm, EntradaReservada, EntradasDoCrm } from './portas'

// A entrada do CRM na agenda (ADR 0001, fase 7b):
//
//   · ligar: o gestor liga a clínica ao CRM; a agenda cadastra o webhook da
//     clínica lá e guarda o segredo cifrado. Desde então os avisos da agenda
//     saem para o CRM (7a) e os do CRM entram por aqui;
//   · receber: a rota confere a assinatura, guarda o aviso e responde na hora;
//   · processar: o worker lê o card como ele está agora no CRM e pede à agenda o
//     que fazer (casos das vindas). O aviso que a própria agenda causou é ignorado.

const RESERVA_MS = 2 * 60_000

export interface DependenciasDaEntrada {
  api: ApiDoCrm | null
  entradas: EntradasDoCrm
  clinicas: ClinicasNoCrm
  vindas: CasosDasVindas
  cifra: Cifra
  assinador: Assinador
  relogio: Relogio
  /** AGENDA_URL: o endereço público da agenda, para onde o CRM manda os avisos. */
  urlDaAgenda: string | null
}

export function casosDaEntradaDoCrm({ api, entradas, clinicas, vindas, cifra, assinador, relogio, urlDaAgenda }: DependenciasDaEntrada) {
  // A agenda usa uma chave só para todas as clínicas: o id dela é lido uma vez.
  let minhaChave: Promise<string | null> | null = null
  const idDaMinhaChave = (api: ApiDoCrm, companyId: string) => {
    minhaChave ??= api.quemSou(companyId).then(
      (eu) => eu.id,
      (erro) => {
        minhaChave = null
        throw erro
      }
    )
    return minhaChave
  }

  function exigirCrm(): ApiDoCrm {
    if (!api) throw new ErroDeDominio('indisponivel', 'CRM_NAO_CONFIGURADO', 'A ligação com o CRM não está configurada neste servidor')
    return api
  }

  async function processar(api: ApiDoCrm, entrada: EntradaReservada): Promise<{ situacao: 'processado' | 'ignorado'; resultado: Record<string, unknown> }> {
    const aviso = lerAviso(entrada.corpo)
    if (!aviso || !aviso.card) return { situacao: 'ignorado', resultado: { motivo: 'AVISO_SEM_CARD' } }
    const pedido = pedidoDoAviso(aviso)
    if (!pedido) return { situacao: 'ignorado', resultado: { motivo: 'NAO_INTERESSA' } }
    if (aviso.ator?.id && aviso.ator.id === (await idDaMinhaChave(api, entrada.companyId))) {
      return { situacao: 'ignorado', resultado: { motivo: 'DA_PROPRIA_AGENDA' } }
    }

    const cardId = aviso.card.id
    const card = await api.card(entrada.companyId, cardId)
    if (pedido.tipo === 'saida') {
      if (card.situacao !== 'aberto' || !saidaVale(pedido.saida, card)) return { situacao: 'ignorado', resultado: { motivo: 'CARD_JA_MUDOU' } }
      return { situacao: 'processado', resultado: { ...(await vindas.cardSaiuNoCrm(entrada.clinicaId, cardId, pedido.saida)) } }
    }

    if (card.situacao !== 'aberto' || card.painel !== 'crc1' || card.etapa !== 'agendados' || !card.agendadoPara) {
      await vindas.cardSemAgendamentoNoCrm(entrada.clinicaId, cardId)
      return { situacao: 'ignorado', resultado: { motivo: 'CARD_NAO_ESTA_AGENDADO' } }
    }
    const agendadoPara = card.agendadoPara
    // A consulta da Clinicorp no horário do card traz o dentista e o fim.
    const doProntuario = (await api.consultasNoProntuario(entrada.companyId, cardId)).find(
      (c) => c.situacao === 'agendada' && c.inicio.getTime() === agendadoPara.getTime()
    )
    const resultado = await vindas.cardAgendadoNoCrm(entrada.clinicaId, {
      cardId,
      inicio: agendadoPara,
      fim: doProntuario?.fim ?? null,
      telefone: card.contato.telefone,
      nome: card.contato.nome,
      crmUnidadeId: doProntuario?.unidadeId ?? card.unidadeId,
      profissionalNoProntuario: doProntuario?.profissional ?? null,
    })
    return { situacao: 'processado', resultado: { ...resultado } }
  }

  return {
    /**
     * O aviso que o webhook do CRM mandou: confere a assinatura com o segredo da
     * clínica e guarda. O repetido é aceito e ignorado.
     */
    async receberAviso(textoCru: string, cabecalhoDaAssinatura: string | null): Promise<'novo' | 'repetido'> {
      let corpo: unknown
      try {
        corpo = JSON.parse(textoCru)
      } catch {
        throw new ErroDeDominio('invalido', 'AVISO_INVALIDO', 'O corpo não é um aviso do CRM')
      }
      const aviso = lerAviso(corpo)
      if (!aviso) throw new ErroDeDominio('invalido', 'AVISO_INVALIDO', 'O corpo não é um aviso do CRM')
      const clinica = await clinicas.peloCompanyId(aviso.clinica.companyId)
      if (!clinica?.segredoCifrado) throw new ErroDeDominio('nao_encontrado', 'CLINICA_NAO_LIGADA', 'Esta clínica não está ligada ao CRM na agenda')

      const assinatura = lerAssinatura(cabecalhoDaAssinatura)
      if (!assinatura) throw new ErroDeDominio('nao_autenticado', 'ASSINATURA_INVALIDA', 'Falta a assinatura do CRM, ou ela não confere')
      const agora = relogio.agora()
      if (!assinaturaNoPrazo(assinatura.t, agora)) throw new ErroDeDominio('nao_autenticado', 'ASSINATURA_VENCIDA', 'A assinatura do aviso é antiga demais')
      const esperada = assinador.hmacHex(cifra.decifrar(clinica.segredoCifrado), `${assinatura.t}.${textoCru}`)
      if (!assinador.iguais(esperada, assinatura.v1)) throw new ErroDeDominio('nao_autenticado', 'ASSINATURA_INVALIDA', 'Falta a assinatura do CRM, ou ela não confere')

      return entradas.guardar(clinica.id, { entregaId: aviso.id, evento: aviso.evento, tipo: aviso.tipo, cardId: aviso.card?.id ?? null, corpo }, agora)
    },

    /** O worker processa os avisos guardados. */
    async processarEntradas(limite = 20): Promise<{ total: number; processados: number; ignorados: number; adiados: number; desistidos: number }> {
      const contagem = { total: 0, processados: 0, ignorados: 0, adiados: 0, desistidos: 0 }
      if (!api) return contagem
      const agora = relogio.agora()
      const reservadas = await entradas.reservar(agora, new Date(agora.getTime() + RESERVA_MS), limite)
      contagem.total = reservadas.length
      for (const entrada of reservadas) {
        const tentativas = entrada.tentativas + 1
        try {
          const { situacao, resultado } = await processar(api, entrada)
          await entradas.concluir(entrada.id, situacao, resultado, tentativas, relogio.agora())
          if (situacao === 'processado') contagem.processados++
          else contagem.ignorados++
        } catch (erro) {
          const texto = erro instanceof Error ? erro.message : String(erro)
          const proxima = vaiPassarSozinho(erro) ? proximaTentativa(tentativas, relogio.agora()) : null
          if (proxima) {
            await entradas.adiar(entrada.id, tentativas, proxima, texto)
            contagem.adiados++
          } else {
            await entradas.desistir(entrada.id, tentativas, texto)
            contagem.desistidos++
          }
        }
      }
      return contagem
    },

    /** Se a clínica está ligada ao CRM, e se este servidor sabe ligar. */
    async estadoDaLigacao(acesso: Acesso) {
      exigirGestor(acesso)
      const clinica = await clinicas.obter(acesso.clinicaId)
      return { ligada: Boolean(clinica?.ligadaAoCrm), recebeAvisos: Boolean(clinica?.webhookId), podeLigar: Boolean(api && urlDaAgenda) }
    },

    /** Liga a clínica ao CRM: cadastra (ou recadastra) o webhook dela lá. */
    async ligar(acesso: Acesso) {
      exigirGestor(acesso)
      const crm = exigirCrm()
      if (!urlDaAgenda) throw new ErroDeDominio('indisponivel', 'CRM_NAO_CONFIGURADO', 'Falta o endereço público da agenda (AGENDA_URL)')
      const clinica = await clinicas.obter(acesso.clinicaId)
      if (!clinica) throw new ErroDeDominio('nao_encontrado', 'CLINICA_NAO_ENCONTRADA', 'Clínica não encontrada')
      if (clinica.webhookId) await crm.apagarWebhook(clinica.companyId, clinica.webhookId)
      const webhook = await crm.criarWebhook(clinica.companyId, { nome: 'Agenda', url: `${urlDaAgenda}/api/v1/crm/avisos`, eventos: EVENTOS_DO_CRM })
      await clinicas.ligar(clinica.id, webhook.id, cifra.cifrar(webhook.segredo))
      return { ligada: true, recebeAvisos: true, podeLigar: true }
    },

    /** Desliga: a agenda para de avisar o CRM e apaga o webhook de lá. */
    async desligar(acesso: Acesso) {
      exigirGestor(acesso)
      const clinica = await clinicas.obter(acesso.clinicaId)
      if (!clinica) throw new ErroDeDominio('nao_encontrado', 'CLINICA_NAO_ENCONTRADA', 'Clínica não encontrada')
      if (clinica.webhookId && api) await api.apagarWebhook(clinica.companyId, clinica.webhookId)
      await clinicas.desligar(clinica.id)
      return { ligada: false, recebeAvisos: false, podeLigar: Boolean(api && urlDaAgenda) }
    },
  }
}
