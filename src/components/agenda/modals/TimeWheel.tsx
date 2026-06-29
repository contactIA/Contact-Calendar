'use client'

import { useEffect, useRef } from 'react'

const ITEM_H = 40 // altura de cada item (px); 3 itens visíveis = banda central + vizinhos

type Props = {
  value:       string // "HH:MM"
  onChange:    (v: string) => void
  minuteStep?: number
  hourStart?:  number
  hourEnd?:    number
}

/**
 * Seletor de horário estilo "criar alarme": duas colunas roláveis (hora e minuto)
 * com encaixe (snap) no centro. Substitui o campo de digitar horário — a pessoa
 * rola/clica em vez de digitar, sem risco de formato inválido.
 */
export function TimeWheel({ value, onChange, minuteStep = 5, hourStart = 6, hourEnd = 22 }: Props) {
  const [hStr, mStr] = (value || '08:00').split(':')

  const hours   = Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i)
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep)

  const selH = Math.max(0, hours.indexOf(clamp(parseInt(hStr, 10) || hourStart, hourStart, hourEnd)))
  const selM = Math.max(0, minutes.indexOf(nearest(parseInt(mStr, 10) || 0, minutes)))

  const emit = (h: number, m: number) =>
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)

  return (
    <div className="relative flex items-stretch justify-center gap-1 select-none">
      {/* banda central destacada com a cor da marca */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 rounded-lg bg-brand/5 ring-1 ring-brand-border/30" />
      {/* fades topo/base para dar a sensação de roleta */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent z-10" />

      <WheelColumn items={hours}   selectedIndex={selH} onSelect={i => emit(hours[i], minutes[selM])} />
      <div className="flex items-center text-xl font-bold text-gray-400">:</div>
      <WheelColumn items={minutes} selectedIndex={selM} onSelect={i => emit(hours[selH], minutes[i])} />
    </div>
  )
}

function WheelColumn({
  items, selectedIndex, onSelect,
}: {
  items: number[]
  selectedIndex: number
  onSelect: (i: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincroniza a posição quando o valor muda (clique ou ajuste externo).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = selectedIndex * ITEM_H
    if (Math.abs(el.scrollTop - target) > 2) el.scrollTo({ top: target, behavior: 'smooth' })
  }, [selectedIndex])

  function handleScroll() {
    const el = ref.current
    if (!el) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      const i = clamp(Math.round(el.scrollTop / ITEM_H), 0, items.length - 1)
      if (i !== selectedIndex) onSelect(i)
    }, 110)
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="no-scrollbar h-30 w-14 overflow-y-scroll"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      <div style={{ height: ITEM_H }} />
      {items.map((v, i) => (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(i)}
          style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
          className={`flex w-full items-center justify-center text-lg tabular-nums transition-all ${
            i === selectedIndex ? 'font-bold text-brand scale-110' : 'text-gray-400'
          }`}
        >
          {String(v).padStart(2, '0')}
        </button>
      ))}
      <div style={{ height: ITEM_H }} />
    </div>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function nearest(n: number, list: number[]) {
  return list.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), list[0])
}
