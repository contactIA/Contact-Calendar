import type { ReactNode } from 'react'

/** A tela inteira com um recado: entrada recusada, sessão acabada, agenda fora do ar. */
export function AvisoDeTela({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Agenda</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">{titulo}</h1>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-gray-600">{children}</div>
      </div>
    </main>
  )
}

/** "Abrindo a agenda…", enquanto a sessão e o /eu chegam. */
export function Abrindo() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50" aria-busy="true">
      <div className="text-center">
        <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
        <p className="text-sm text-gray-500">Abrindo a agenda…</p>
      </div>
    </main>
  )
}
