# Memória do Projeto — Plataforma Contact (Escala Agenda 2.0)

> Última atualização: 2026-06-24 — Daniel

## 1. Contexto Essencial

- **O que é:** Evolução do Escala Agenda em plataforma completa de gestão de jornada do paciente para clínicas odontológicas. Usa o HelenaCRM como backend de funil (kanban) e mantém agenda própria como fonte da verdade de agendamentos.
- **Stack:** Next.js 16.2.6 + React 19 + TypeScript 5 + Tailwind CSS 4 + Radix UI + Supabase PG17 + Vercel
- **Repositório local:** `c:/Users/daniel.jesus/Documents/desenvolvimento/Contact-Calendar/`
- **Documentos-fonte:** `desenvolvimento/arquitetura-e-componentes.md`, `desenvolvimento/requisitos-do-sistema.md`, `desenvolvimento/BACKLOG.md`, `desenvolvimento/ROADMAP-PRODUTO.md`
- **Como rodar:** `npm run dev` → http://localhost:3000

## 2. Decisões

| Data | Decisão | Motivo | Impacto |
|------|---------|--------|---------|
| 2026-06-24 | Tokens de marca declarados em `:root` + `@theme inline` (Tailwind 4), não só em `@theme {}` como o backlog sugeria | Tailwind 4 só gera utilities automáticas de cor via prefixo `--color-*` no `@theme`; gradiente não é cor simples e precisa de `@utility` | Todos os componentes futuros usam `bg-brand`, `text-brand`, `ring-brand-border` etc. |
| 2026-06-24 | `bg-brand-light` e `ring-brand-border` geradas automaticamente pelo Tailwind via `--color-brand-light` e `--color-brand-border` no `@theme inline` | Cores simples não precisam de `@utility` manual | Menos código, mesma funcionalidade |

## 3. Log de Execuções

| Data | O que foi feito | Por quem | Task/Ref |
|------|----------------|----------|----------|
| 2026-06-24 | Botão "Criar conta e continuar" do onboarding atualizado para `bg-brand` (extra, fora do escopo da TASK-040) | Daniel | — |
| 2026-06-24 | Botão "Agendar" do `AgendaHeader.tsx` atualizado para `bg-brand` (teste visual da TASK-040) | Daniel | TASK-040 |
| 2026-06-24 | TASK-040 concluída: tokens de marca declarados no `globals.css`, utilities criadas, cores semânticas adicionadas | Daniel | TASK-040 |
| 2026-06-24 | TASK-001 concluída: token Helena rotacionado e secret store configurado | André | TASK-001 |

## 4. Aprendizados e Armadilhas

- **Tailwind 4 não usa `tailwind.config.js`** — toda configuração é CSS-first, dentro do `globals.css` com `@theme` e `@utility`. Nunca tentar configurar pelo arquivo de config antigo.
- **`@theme inline` vs `@theme`:** `inline` significa que os valores são embutidos no CSS gerado (sem criar variáveis CSS separadas no `:root`). Para que as variáveis fiquem acessíveis via `var(--brand)` em `style={}` do JSX, elas precisam estar no `:root` normal.
- **Gradiente não é cor simples:** `--color-brand: linear-gradient(...)` no `@theme` não geraria `bg-brand` com gradiente — o Tailwind trataria como cor e quebraria. Use `@utility bg-brand { background: var(--brand) }`.
- **Tokens com prefixo `--color-*`** no `@theme` geram automaticamente uma família inteira: `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, `stroke-*`. Aproveitar isso evita declarar `@utility` manualmente para cada variante.

## 5. Pendências Técnicas

- [ ] Botões restantes do onboarding ("Continuar", "Concluir setup", "Ir para a agenda") ainda usam `bg-gradient-to-r from-violet-600 to-rose-500` — registrada em 2026-06-24. Atualizar quando houver task de design system nas telas existentes.
- [ ] Sombra do botão "Agendar" ainda está inline (`style={{ boxShadow: '...' }}`). Criar utility `shadow-brand` numa task futura de design system.
- [ ] StepIndicator e connectores do onboarding ainda usam `bg-violet-600`, `bg-violet-400`, `ring-violet-400` hardcoded — não usam o design system ainda.
