import { ErroDeDominio } from '@/compartilhado/erros'
import { instanteNoFuso } from '@/compartilhado/fuso'

// Os horários livres e a conferência de um horário pedido (docs/modelo-de-dados.md).
//
// Era a função get_available_slots do banco antigo; aqui fica testável sem banco,
// com o fuso e o instante de agora por parâmetro. As regras que vieram de lá:
//   · a grade respeita a duração real do procedimento: 90 minutos reservam os 90;
//   · a cadência (de quanto em quanto tempo um início é oferecido) é outra coisa,
//     e conta a partir do início de cada intervalo do expediente;
//   · um horário só vale com o profissional livre e alguma cadeira livre.
// E as que entraram agora:
//   · nada no passado;
//   · o paciente também não pode estar em outra consulta (decisão D5);
//   · o expediente pode ter vários intervalos no dia.

/** Um intervalo [início, fim): encostar no fim do outro não conta como cruzar. */
export interface Janela {
  inicio: Date
  fim: Date
}

export const cruza = (a: Janela, b: Janela) => a.inicio < b.fim && b.inicio < a.fim

const livre = (janela: Janela, ocupacoes: readonly Janela[]) => !ocupacoes.some((o) => cruza(janela, o))

const MINUTO = 60_000

export interface CadeiraComOcupacoes {
  id: string
  ocupacoes: Janela[]
}

export interface EntradaDosHorariosLivres {
  /** O dia, AAAA-MM-DD, no fuso da clínica. */
  data: string
  fuso: string
  cadenciaMinutos: number
  duracaoMinutos: number
  /** Os intervalos do expediente do profissional nesta unidade, nesse dia da semana: "08:00" a "12:00". */
  expedientes: { inicio: string; fim: string }[]
  /** As consultas dele (em qualquer unidade) e os bloqueios. */
  ocupacoesDoProfissional: Janela[]
  ocupacoesDoPaciente?: Janela[]
  /** As cadeiras ativas da unidade, na ordem de preferência. */
  cadeiras: CadeiraComOcupacoes[]
  agora: Date
}

export interface HorarioLivre extends Janela {
  cadeiraId: string
}

/** Os intervalos do expediente como instantes, em ordem. */
export function janelasDoExpediente(data: string, fuso: string, expedientes: { inicio: string; fim: string }[]): Janela[] {
  return expedientes
    .map((e) => ({ inicio: instanteNoFuso(data, e.inicio, fuso), fim: instanteNoFuso(data, e.fim, fuso) }))
    .filter((j) => j.fim > j.inicio)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
}

/** A primeira cadeira livre na janela, preferindo a pedida. `null` se nenhuma está livre. */
export function escolherCadeira(cadeiras: readonly CadeiraComOcupacoes[], janela: Janela, preferida?: string | null): string | null {
  const ordem = preferida ? [...cadeiras.filter((c) => c.id === preferida), ...cadeiras.filter((c) => c.id !== preferida)] : cadeiras
  return ordem.find((c) => livre(janela, c.ocupacoes))?.id ?? null
}

export function horariosLivres(e: EntradaDosHorariosLivres): HorarioLivre[] {
  if (e.duracaoMinutos <= 0 || e.cadenciaMinutos <= 0) return []
  const duracao = e.duracaoMinutos * MINUTO
  const passo = e.cadenciaMinutos * MINUTO
  const livres: HorarioLivre[] = []
  for (const intervalo of janelasDoExpediente(e.data, e.fuso, e.expedientes)) {
    for (let inicio = intervalo.inicio.getTime(); inicio + duracao <= intervalo.fim.getTime(); inicio += passo) {
      const janela = { inicio: new Date(inicio), fim: new Date(inicio + duracao) }
      if (janela.inicio < e.agora) continue
      if (!livre(janela, e.ocupacoesDoProfissional) || !livre(janela, e.ocupacoesDoPaciente ?? [])) continue
      const cadeiraId = escolherCadeira(e.cadeiras, janela)
      if (cadeiraId) livres.push({ ...janela, cadeiraId })
    }
  }
  return livres
}

export interface PedidoDeHorario {
  janela: Janela
  /** Os intervalos do expediente do profissional naquele dia, como instantes. */
  expediente: Janela[]
  /** A chave da IA e as integrações só marcam dentro do expediente e no futuro; a recepção pode encaixar. */
  podeEncaixar: boolean
  agora: Date
  ocupacoesDoProfissional: Janela[]
  ocupacoesDoPaciente: Janela[]
  cadeiras: CadeiraComOcupacoes[]
  /** A cadeira pedida, ou a atual numa remarcação: fica com ela se estiver livre. */
  cadeiraPreferida?: string | null
  /** Quando a cadeira foi pedida explicitamente: ocupada é erro, e não troca. */
  cadeiraObrigatoria?: boolean
}

/**
 * Confere um horário pedido para agendar ou remarcar e devolve a cadeira. Recusa
 * com a frase certa antes do banco: as restrições de exclusão do banco continuam
 * lá, para os pedidos que chegam ao mesmo tempo.
 */
export function conferirHorario(p: PedidoDeHorario): string {
  if (!p.podeEncaixar) {
    if (p.janela.inicio < p.agora) {
      throw new ErroDeDominio('invalido', 'HORARIO_NO_PASSADO', 'O horário já passou')
    }
    if (!p.expediente.some((e) => e.inicio <= p.janela.inicio && p.janela.fim <= e.fim)) {
      throw new ErroDeDominio('conflito', 'FORA_DO_EXPEDIENTE', 'O profissional não atende nesse horário')
    }
  }
  if (!livre(p.janela, p.ocupacoesDoProfissional)) {
    throw new ErroDeDominio('conflito', 'HORARIO_DO_PROFISSIONAL_OCUPADO', 'O profissional já tem consulta ou bloqueio nesse horário')
  }
  if (!livre(p.janela, p.ocupacoesDoPaciente)) {
    throw new ErroDeDominio('conflito', 'PACIENTE_JA_TEM_CONSULTA', 'O paciente já tem consulta nesse horário')
  }
  if (p.cadeiraObrigatoria && p.cadeiraPreferida) {
    const cadeira = p.cadeiras.find((c) => c.id === p.cadeiraPreferida)
    if (!cadeira) throw new ErroDeDominio('nao_encontrado', 'CADEIRA_NAO_ENCONTRADA', 'Cadeira não encontrada nesta unidade')
    if (!livre(p.janela, cadeira.ocupacoes)) {
      throw new ErroDeDominio('conflito', 'CADEIRA_OCUPADA', 'A cadeira já está ocupada nesse horário')
    }
    return cadeira.id
  }
  const cadeiraId = escolherCadeira(p.cadeiras, p.janela, p.cadeiraPreferida)
  if (!cadeiraId) throw new ErroDeDominio('conflito', 'SEM_CADEIRA_LIVRE', 'Nenhuma cadeira da unidade está livre nesse horário')
  return cadeiraId
}
