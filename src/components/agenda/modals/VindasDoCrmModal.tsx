'use client'

import { useState, useEffect } from 'react'
import { useAnimatedMount } from '@/hooks/useAnimatedMount'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { CadeiraJson, VindaJson } from '@/api/v1/esquemas'
import { diaNoFuso, horaNoFuso, instanteNoFuso } from '@/compartilhado/fuso'
import { useEu } from '@/componentes/casca'
import { api, fraseDoErro } from '@/componentes/cliente/api'
import { type Dentist } from '@/hooks/useDentists'
import { type Procedure } from '@/hooks/useProcedures'

// As consultas que o CRM marcou fora da agenda (a CRC no prontuário, o botão, a
// IA) e que não entraram sozinhas (fase 7b). A recepção encaixa, escolhendo o
// profissional, o procedimento e a cadeira, ou descarta.

/** Por que a consulta não entrou sozinha, na língua de quem lê. */
const MOTIVOS: Record<string, string> = {
  UNIDADE_SEM_VINCULO: 'A unidade do card no CRM não está ligada a uma unidade da agenda',
  DENTISTA_SEM_VINCULO: 'O dentista do prontuário ainda não está ligado a um profissional da agenda',
  SEM_DENTISTA: 'O CRM não informou o dentista',
  SEM_PROCEDIMENTO: 'Falta escolher o procedimento das consultas do CRM, nas Configurações',
  SEM_NOME: 'O CRM não informou o nome do paciente',
  HORARIO_DO_PROFISSIONAL_OCUPADO: 'O profissional já tem consulta nesse horário',
  CADEIRA_OCUPADA: 'Nenhuma cadeira livre nesse horário',
  SEM_CADEIRA_LIVRE: 'Nenhuma cadeira livre nesse horário',
  PACIENTE_JA_TEM_CONSULTA: 'O paciente já tem consulta nesse horário',
  PACIENTE_AMBIGUO: 'Há mais de um paciente com esse telefone e esse nome',
}

const motivoDe = (codigo: string | null) => (codigo ? (MOTIVOS[codigo] ?? 'Não coube sozinha na agenda') : '')

/** O telefone como a clínica lê: o do Brasil sai sem o código do país, como na lista de pacientes. */
function telefoneLegivel(telefone: string) {
  const todos = telefone.replace(/\D/g, '')
  const d = todos.length >= 12 && todos.startsWith('55') ? todos.slice(2) : todos
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone
}

const campo =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200'
const rotulo = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1'

type Props = {
  open: boolean
  vindas: VindaJson[]
  dentists: Dentist[]
  procedures: Procedure[]
  onClose: () => void
  /** Encaixou ou descartou: a agenda e a lista recarregam. */
  onChanged: () => void
}

export function VindasDoCrmModal({ open, vindas, dentists, procedures, onClose, onChanged }: Props) {
  const { mounted, closing } = useAnimatedMount(open, 180)
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/30 ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden max-h-[85vh] ${closing ? 'animate-modal-out' : 'animate-modal-in'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Consultas vindas do CRM</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Marcadas fora da agenda e que esperam um encaixe</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {vindas.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhuma consulta esperando encaixe</p>}
          {vindas.map((v) => (
            <ItemDaVinda
              key={v.id}
              vinda={v}
              aberta={aberta === v.id}
              onAbrir={() => setAberta(aberta === v.id ? null : v.id)}
              dentists={dentists}
              procedures={procedures}
              onChanged={() => { setAberta(null); onChanged() }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ItemDaVinda({
  vinda,
  aberta,
  onAbrir,
  dentists,
  procedures,
  onChanged,
}: {
  vinda: VindaJson
  aberta: boolean
  onAbrir: () => void
  dentists: Dentist[]
  procedures: Procedure[]
  onChanged: () => void
}) {
  const eu = useEu()
  const fuso = eu.clinica.fusoHorario
  const inicio = new Date(vinda.inicio)
  const remarcar = vinda.tipo === 'remarcar'
  const duracaoDaVinda = vinda.fim ? Math.round((new Date(vinda.fim).getTime() - inicio.getTime()) / 60_000) : null

  const [data, setData] = useState(() => diaNoFuso(inicio, fuso))
  const [hora, setHora] = useState(() => horaNoFuso(inicio, fuso))
  const [profissionalId, setProfissionalId] = useState(vinda.consultaAtual?.profissional.id ?? '')
  const [procedimentoId, setProcedimentoId] = useState(eu.clinica.procedimentoDasVindasId ?? '')
  const [cadeiraId, setCadeiraId] = useState('')
  const [cadeiras, setCadeiras] = useState<{ id: string; nome: string }[]>([])
  const [nome, setNome] = useState(vinda.nome ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const unidadeId = vinda.unidade?.id
  useEffect(() => {
    if (!aberta || !unidadeId) return
    api.get<{ cadeiras: CadeiraJson[] }>(`/cadeiras?unidadeId=${unidadeId}`)
      .then((r) => setCadeiras(r.cadeiras.filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome }))))
      .catch(() => {})
  }, [aberta, unidadeId])

  const mudouOHorario = data !== diaNoFuso(inicio, fuso) || hora !== horaNoFuso(inicio, fuso)

  async function encaixar() {
    if (!profissionalId) { setErro('Escolha o profissional'); return }
    if (!remarcar && !procedimentoId) { setErro('Escolha o procedimento'); return }
    setSalvando(true); setErro('')
    try {
      await api.post(`/vindas/${vinda.id}/encaixar`, {
        profissionalId,
        ...(remarcar ? {} : { procedimentoId }),
        ...(cadeiraId ? { cadeiraId } : {}),
        ...(mudouOHorario ? { inicio: instanteNoFuso(data, hora, fuso).toISOString() } : {}),
        ...(!vinda.nome && nome.trim() ? { nome: nome.trim() } : {}),
      })
      onChanged()
    } catch (e) {
      setErro(fraseDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  async function descartar() {
    setSalvando(true); setErro('')
    try {
      await api.post(`/vindas/${vinda.id}/descartar`)
      onChanged()
    } catch (e) {
      setErro(fraseDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={onAbrir} className="w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-800 truncate">{vinda.nome ?? telefoneLegivel(vinda.telefone)}</p>
            <p className="text-[11px] text-gray-400">
              {format(inicio, "EEEE, d 'de' MMM 'às' HH:mm", { locale: ptBR })}
              {vinda.unidade ? ` · ${vinda.unidade.nome}` : ''}
              {vinda.profissionalNoProntuario?.nome ? ` · ${vinda.profissionalNoProntuario.nome}` : ''}
            </p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${remarcar ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700'}`}>
            {remarcar ? 'Remarcar' : 'Marcar'}
          </span>
        </div>
        {remarcar && vinda.consultaAtual && (
          <p className="text-[11px] text-gray-500 mt-1">
            Hoje na agenda: {format(new Date(vinda.consultaAtual.inicio), "d 'de' MMM 'às' HH:mm", { locale: ptBR })} com {vinda.consultaAtual.profissional.nome}
          </p>
        )}
        {vinda.motivo && <p className="text-[11px] text-rose-500 mt-1">{motivoDe(vinda.motivo)}</p>}
      </button>

      {aberta && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100 bg-gray-50/50">
          {!vinda.nome && !remarcar && (
            <div>
              <label className={rotulo}>Nome do paciente</label>
              <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`Quem tem o telefone ${telefoneLegivel(vinda.telefone)}`} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rotulo}>Data</label>
              <input type="date" className={campo} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <label className={rotulo}>Horário{duracaoDaVinda ? ` (${duracaoDaVinda} min)` : ''}</label>
              <input type="time" className={campo} value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={rotulo}>Profissional</label>
            <select className={campo} value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
              <option value="">Selecione...</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>{d.user?.name ?? d.id}</option>
              ))}
            </select>
            {vinda.profissionalNoProntuario && !remarcar && (
              <p className="text-[11px] text-gray-400 mt-1">Da próxima vez, as consultas desse dentista entram sozinhas com o profissional escolhido.</p>
            )}
          </div>
          {!remarcar && (
            <div>
              <label className={rotulo}>Procedimento</label>
              <select className={campo} value={procedimentoId} onChange={(e) => setProcedimentoId(e.target.value)}>
                <option value="">Selecione...</option>
                {procedures.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          {cadeiras.length > 0 && (
            <div>
              <label className={rotulo}>Cadeira</label>
              <select className={campo} value={cadeiraId} onChange={(e) => setCadeiraId(e.target.value)}>
                <option value="">A primeira livre</option>
                {cadeiras.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          )}
          {erro && <p className="text-xs text-red-500">{erro}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={descartar}
              disabled={salvando}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Descartar
            </button>
            <button
              onClick={encaixar}
              disabled={salvando || !vinda.unidade}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-rose-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : remarcar ? 'Remarcar' : 'Encaixar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
