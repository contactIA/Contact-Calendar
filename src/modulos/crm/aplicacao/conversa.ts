import { ErroDeDominio } from '@/compartilhado/erros'
import type { Acesso } from '@/modulos/acesso/aplicacao/acesso'
import type { casosDaAgenda } from '@/modulos/agenda/aplicacao/casos'
import { ErroDoCrm } from '../dominio/entrega'
import type { ApiDoCrm } from './portas'

// A conversa com o paciente na plataforma de mensagens, a partir da consulta
// (fase 7c). Quem sabe abrir a conversa é o CRM (GET /cards/{id}/atendimento): a
// agenda não guarda o token da plataforma. O card é o da consulta (o que a
// entrega ao CRM guardou) ou, sem ele, o card aberto do telefone do paciente.

/** O card da consulta e o que precisa para achar a conversa. */
export interface ConsultaParaConversa {
  companyId: string
  cardId: string | null
  telefone: string | null
}

export interface DependenciasDaConversa {
  api: ApiDoCrm | null
  agenda: ReturnType<typeof casosDaAgenda>
  consultaParaConversa(clinicaId: string, consultaId: string): Promise<ConsultaParaConversa | null>
}

const semConversa = () => new ErroDeDominio('nao_encontrado', 'SEM_CONVERSA', 'Este paciente ainda não tem conversa na plataforma')

export function casosDaConversa({ api, agenda, consultaParaConversa }: DependenciasDaConversa) {
  return {
    /** O endereço da conversa do paciente da consulta. */
    async conversaDaConsulta(acesso: Acesso, consultaId: string): Promise<{ url: string }> {
      // A consulta que o acesso não enxerga (outra unidade, outro dentista) é inexistente.
      await agenda.consulta(acesso, consultaId)
      if (!api) throw new ErroDeDominio('indisponivel', 'CRM_NAO_CONFIGURADO', 'A ligação com o CRM não está configurada neste servidor')
      const consulta = await consultaParaConversa(acesso.clinicaId, consultaId)
      if (!consulta) throw new ErroDeDominio('nao_encontrado', 'CONSULTA_NAO_ENCONTRADA', 'Consulta não encontrada')
      try {
        const cardId = consulta.cardId ?? (consulta.telefone ? (await api.cardAbertoDoContato(consulta.companyId, consulta.telefone))?.id : null)
        if (!cardId) throw semConversa()
        const atendimento = await api.atendimento(consulta.companyId, cardId)
        if (!atendimento) throw semConversa()
        return { url: atendimento.url }
      } catch (erro) {
        if (erro instanceof ErroDoCrm) {
          if (erro.codigo === 'CARD_NAO_ENCONTRADO') throw semConversa()
          throw new ErroDeDominio('externo', 'CRM_FALHOU', 'O CRM não respondeu agora. Tente de novo em instantes.')
        }
        throw erro
      }
    },
  }
}
