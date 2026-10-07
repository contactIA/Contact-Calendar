// Datas no fuso da clínica, sem pacote: o Intl do próprio JavaScript faz a conta,
// como no CRM. É o que permite ao domínio calcular os horários livres com o fuso
// por parâmetro, e não no fuso do servidor (a remarcação antiga gravava 3 horas a
// menos por isso).

const FORMATOS = new Map<string, Intl.DateTimeFormat>()

function formatoDe(fuso: string): Intl.DateTimeFormat {
  let f = FORMATOS.get(fuso)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    FORMATOS.set(fuso, f)
  }
  return f
}

function partes(instante: Date, fuso: string) {
  return Object.fromEntries(formatoDe(fuso).formatToParts(instante).map((x) => [x.type, x.value])) as Record<string, string>
}

/** Quanto o fuso está à frente do UTC no instante (negativo: atrás). */
function deslocamentoMs(instante: number, fuso: string): number {
  const p = partes(new Date(instante), fuso)
  const comoUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return comoUtc - Math.floor(instante / 1000) * 1000
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/
const HORA = /^([01]\d|2[0-4]):([0-5]\d)(?::([0-5]\d))?$/

/** "2026-10-08" → [2026, 10, 8], ou null se não for uma data de verdade. */
export function lerData(data: string): [number, number, number] | null {
  const m = DATA.exec(data)
  if (!m) return null
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? [ano, mes, dia] : null
}

/** "08:30" → minutos desde a meia-noite (510). "24:00" vale como o fim do dia. */
export function minutosDaHora(hora: string): number {
  const m = HORA.exec(hora)
  if (!m || (m[1] === '24' && (m[2] !== '00' || (m[3] ?? '00') !== '00'))) throw new Error(`Hora inválida: "${hora}"`)
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * O instante em que o relógio de parede do fuso mostra a data e a hora dadas.
 * Na virada do horário de verão, a hora que não existe cai na hora seguinte.
 */
export function instanteNoFuso(data: string, hora: string, fuso: string): Date {
  const lida = lerData(data)
  if (!lida) throw new Error(`Data inválida: "${data}"`)
  const [ano, mes, dia] = lida
  const minutos = minutosDaHora(hora)
  const comoUtc = Date.UTC(ano, mes - 1, dia) + minutos * 60_000
  const palpite = comoUtc - deslocamentoMs(comoUtc, fuso)
  const instante = new Date(comoUtc - deslocamentoMs(palpite, fuso))
  // Na hora que não existe, a conta volta para antes do pulo; o palpite fica depois.
  const bate = diaNoFuso(instante, fuso) === data && minutosDaHora(horaNoFuso(instante, fuso)) === minutos % (24 * 60)
  return bate || minutos === 24 * 60 ? instante : new Date(palpite)
}

/** O dia do instante no fuso: AAAA-MM-DD. */
export function diaNoFuso(instante: Date, fuso: string): string {
  const p = partes(instante, fuso)
  return `${p.year}-${p.month}-${p.day}`
}

/** A hora do instante no fuso: HH:MM. */
export function horaNoFuso(instante: Date, fuso: string): string {
  const p = partes(instante, fuso)
  return `${p.hour}:${p.minute}`
}

/** O dia da semana de uma data, 0 (domingo) a 6 (sábado). Não depende de fuso. */
export function diaDaSemana(data: string): number {
  const lida = lerData(data)
  if (!lida) throw new Error(`Data inválida: "${data}"`)
  return new Date(Date.UTC(lida[0], lida[1] - 1, lida[2])).getUTCDay()
}

/** O dia seguinte: "2026-10-31" → "2026-11-01". */
export function diaSeguinte(data: string): string {
  const lida = lerData(data)
  if (!lida) throw new Error(`Data inválida: "${data}"`)
  return new Date(Date.UTC(lida[0], lida[1] - 1, lida[2] + 1)).toISOString().slice(0, 10)
}

/** O fuso existe? (`America/Sao_Paulo` sim, `Brasil/Goiania` não.) */
export function fusoValido(fuso: string): boolean {
  try {
    formatoDe(fuso)
    return true
  } catch {
    return false
  }
}
