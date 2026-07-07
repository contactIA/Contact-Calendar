'use client'

export type FilterChip = {
  key: string
  label: string
  onRemove: () => void
}

// Faixa de filtros ativos (TASK-033): aparece entre os KPIs e a grade quando
// unidade e/ou procedimento estão filtrados, usando os tokens de marca
// (bg-brand-light na faixa, bg-brand no chip — TASK-040).
export function FilterChips({ chips }: { chips: FilterChip[] }) {
  if (chips.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-brand-light border-b border-brand-border flex-shrink-0">
      <span className="text-[11px] font-semibold text-brand uppercase tracking-wider">Filtros:</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map(chip => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-brand text-white text-[12px] font-semibold shadow-sm"
          >
            {chip.label}
            <button
              onClick={chip.onRemove}
              aria-label={`Remover filtro ${chip.label}`}
              className="w-4 h-4 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-white text-[10px] leading-none transition-colors"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <button
        onClick={() => chips.forEach(c => c.onRemove())}
        className="ml-auto text-[11px] font-semibold text-brand hover:underline"
      >
        Limpar todos
      </button>
    </div>
  )
}
