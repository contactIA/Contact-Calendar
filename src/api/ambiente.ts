import type { CasosDeUso } from '@/composicao'
import type { Acesso } from '@/modulos/acesso/aplicacao/acesso'

/** O que cada pedido carrega: os casos de uso do processo e, nas rotas protegidas, quem pede. */
export interface Ambiente {
  Variables: {
    casos: CasosDeUso
    acesso: Acesso
  }
}
