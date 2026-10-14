// Regras da entrada pelo item de menu da plataforma (ADR 0001, como o ADR 0002 do
// CRM). Funções puras: o caso de uso passa os cabeçalhos do pedido, e a decisão
// sai daqui.
//
// A plataforma troca {{companyId}} e {{userId}} na URL do menu por quem está
// logado. Nenhum dos dois vem assinado, então a origem é conferida:
//
//   · se a lista de hosts da plataforma estiver configurada, a página só abre
//     dentro dela: o Referer, quando vem, precisa ser de um desses hosts; sem
//     Referer (política do navegador), o pedido precisa ser de um iframe;
//   · sem a lista (desenvolvimento), não há conferência.
//
// A proteção de verdade contra outro site embutir a agenda é o cabeçalho CSP
// frame-ancestors, que o navegador cumpre (src/proxy.ts).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MotivoDeRecusa = 'parametros_invalidos' | 'fora_da_plataforma'

export interface PedidoDeEntrada {
  companyId: string | null
  userId: string | null
  referer: string | null
  /** Cabeçalho Sec-Fetch-Dest do navegador: "iframe" quando aberto dentro de outra página. */
  destino: string | null
}

export function hostPermitido(host: string, permitidos: readonly string[]): boolean {
  const h = host.toLowerCase()
  return permitidos.some((p) => h === p || h.endsWith(`.${p}`))
}

export function conferirEntrada(pedido: PedidoDeEntrada, hostsDaPlataforma: readonly string[]): MotivoDeRecusa | null {
  // Um marcador que a plataforma não trocou ("{{userId}}") não é id.
  if (!pedido.companyId || !UUID.test(pedido.companyId) || !pedido.userId || !UUID.test(pedido.userId)) {
    return 'parametros_invalidos'
  }
  if (hostsDaPlataforma.length === 0) return null
  if (pedido.referer) {
    let host: string
    try {
      host = new URL(pedido.referer).hostname
    } catch {
      return 'fora_da_plataforma'
    }
    return hostPermitido(host, hostsDaPlataforma) ? null : 'fora_da_plataforma'
  }
  return pedido.destino === 'iframe' ? null : 'fora_da_plataforma'
}

/** Lista "app.fluxodonto.com, outro.com" do .env → hosts limpos. */
export function lerHosts(texto: string | undefined): string[] {
  return (texto ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean)
}

/** Algum papel, para entrar: sem nenhum, o usuário não tem o que fazer na agenda. */
export const temAlgumPapel = (papeis: { gestor: boolean; recepcao: boolean; dentista: boolean }) =>
  papeis.gestor || papeis.recepcao || papeis.dentista
