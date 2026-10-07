import type { CasosDeUso } from '@/composicao'

/** O que cada pedido carrega: os casos de uso do processo. Quem pede entra com o acesso (fase 8). */
export interface Ambiente {
  Variables: {
    casos: CasosDeUso
  }
}
