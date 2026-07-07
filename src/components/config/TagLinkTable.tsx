'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/client'
import { useUnits } from '@/hooks/useUnits'

// Vínculo de tags Helena → significado (TASK-013). Para cada tag da conta
// Helena, o admin escolhe a família (unidade / CRC / canal) e o significado.
// É o "tradutor" que os filtros dos dashboards e o sync (TASK-022) consomem.

type TagFamily = 'unit' | 'crc' | 'channel'

type TagRow = {
  id:      string          // UUID da tag na Helena
  name:    string          // nome da tag no painel Helena
  family:  TagFamily | null
  meaning: string | null
  unit_id: string | null
}

const FAMILY_OPTIONS: { value: '' | TagFamily; label: string }[] = [
  { value: '',        label: '— sem vínculo —' },
  { value: 'unit',    label: 'Unidade' },
  { value: 'crc',     label: 'CRC (quem agendou)' },
  { value: 'channel', label: 'Canal de origem' },
]

const selectCls = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-border bg-white'

export function TagLinkTable() {
  const { units } = useUnits()
  const [rows, setRows]       = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    let cancelled = false
    // Fetch dentro do timeout (assíncrono) — nunca setState síncrono no corpo
    // do effect (regra react-hooks/set-state-in-effect; padrão do AgendaShell).
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ data: TagRow[] }>('/api/admin/integrations/helena/tags')
        if (!cancelled) setRows(res.data ?? [])
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Erro ao carregar as tags')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 0)
    return () => { cancelled = true; clearTimeout(t) }
  }, [])

  function patchRow(id: string, patch: Partial<TagRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  // Trocar a família zera significado/unidade — evita salvar resto de estado
  // da família anterior (ex.: unit_id pendurado numa tag que virou canal).
  function changeFamily(id: string, family: '' | TagFamily) {
    patchRow(id, { family: family || null, meaning: null, unit_id: null })
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const links = rows.map(r => ({
        helena_tag_id: r.id,
        family:        r.family,
        meaning:       r.meaning?.trim() || null,
        unit_id:       r.family === 'unit' ? r.unit_id || null : null,
      }))
      await api.put('/api/admin/integrations/helena/tags', { links })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar os vínculos')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Vínculo de tags</p>
      <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
        Diga o que cada tag da Helena significa: unidade, CRC (quem agendou) ou canal de origem.
        Os dashboards e a sincronização usam estes vínculos para filtrar os cards.
      </p>

      {loading ? (
        <p className="text-[11px] text-gray-400">Carregando tags da Helena...</p>
      ) : loadError ? (
        <p className="text-xs text-red-500">{loadError}</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-amber-600">
          Nenhuma tag encontrada nesta conta Helena. Crie as tags manualmente no painel Helena e recarregue.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-1/3">Tag na Helena</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-1/3">Família</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide w-1/3">Significado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2.5">
                      <p className="text-gray-700 font-medium text-xs">{row.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono truncate max-w-[180px]" title={row.id}>{row.id}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className={selectCls}
                        value={row.family ?? ''}
                        onChange={e => changeFamily(row.id, e.target.value as '' | TagFamily)}
                      >
                        {FAMILY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {row.family === 'unit' ? (
                        <select
                          className={selectCls}
                          value={row.unit_id ?? ''}
                          onChange={e => patchRow(row.id, { unit_id: e.target.value || null })}
                        >
                          <option value="">— escolha a unidade —</option>
                          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      ) : row.family ? (
                        <input
                          type="text"
                          className={selectCls}
                          value={row.meaning ?? ''}
                          onChange={e => patchRow(row.id, { meaning: e.target.value })}
                          placeholder={row.family === 'crc' ? 'ex.: Agendados Ana' : 'ex.: Instagram'}
                        />
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-solid text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving ? 'Salvando...' : 'Salvar vínculos'}
            </button>
            {saved && <span className="text-xs font-medium text-emerald-600">✓ Vínculos salvos</span>}
          </div>
        </>
      )}
    </div>
  )
}
