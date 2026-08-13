// ============================================================================
// Rota /[accountId]/paineis — a tela do kanban (TASK-042, SubTask 1).
//
// Fina de propósito, igual à rota da agenda (`agenda/page.tsx` → <AgendaShell/>):
// a rota só existe para dar endereço à tela; toda a lógica mora no
// KanbanBoard. O layout de [accountId] já cuida da autenticação antes de
// renderizar qualquer filho (useAuth: ?token= do sistema-pai ou ?userId= em dev).
// ============================================================================

import { KanbanBoard } from '@/components/kanban/KanbanBoard'

export default function PaineisPage() {
  return <KanbanBoard />
}
