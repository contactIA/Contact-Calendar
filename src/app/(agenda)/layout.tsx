import { Casca } from '@/componentes/casca'

// As páginas da agenda: todas dentro da casca, que confere a sessão e traz o /eu.
export default function LayoutDaAgenda({ children }: { children: React.ReactNode }) {
  return <Casca>{children}</Casca>
}
