// ============================================================================
// GET /api/realtime/token  (TASK-041, suporte à SubTask 3)
//
// PARA QUE SERVE
// O navegador precisa assinar o Realtime de helena_cards, e o Realtime do
// Supabase respeita RLS. A policy criada em
// 20260803120000_helena_cards_realtime_rls.sql libera a linha quando
// `account_id` = claim `account_id` do token. Este endpoint é quem emite esse
// token: pega o accountId do NOSSO JWT (já validado pelo withAuth) e devolve um
// JWT no formato que o Supabase entende.
//
// POR QUE NÃO DÁ PARA REAPROVEITAR O NOSSO JWT
// O nosso token (src/lib/auth.ts) é assinado com JWT_SECRET e usa `role` para o
// perfil da aplicação ('admin' | 'receptionist' | ...). O Supabase espera outro
// segredo (o do projeto) e usa `role` para a role do Postgres. São dois
// universos diferentes — daí os dois tokens.
//
// SEGURANÇA
//   * O claim account_id vem do JWT verificado, NUNCA de query/body — o cliente
//     não consegue pedir o token de outra clínica.
//   * O token só abre helena_cards: é a única tabela com policy + grant. As
//     outras 21 tabelas seguem deny-all (RLS ligado, zero policies), então nem
//     patients nem appointments ficam acessíveis com ele.
//   * Só SELECT. Nenhuma escrita pelo cliente (ADR 7 — single writer).
//   * Validade casada com a sessão humana (8h, igual authenticateHumanUser),
//     para não precisar de um renovador de token no frontend.
// ============================================================================

import { SignJWT } from 'jose'
import { withAuth, ok, err } from '@/lib/api'

const TTL_SECONDS = 8 * 60 * 60 // 8h — mesma janela do JWT humano

export const GET = withAuth(async (_req, ctx) => {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    // 503 e não 500: é configuração ausente, não bug. O hook usePanelCards trata
    // este caso caindo para revalidação periódica (polling), então a tela
    // continua atualizando — só perde o "na hora".
    return err(
      'SUPABASE_JWT_SECRET não configurado — Realtime indisponível (a UI cai para revalidação periódica).',
      503,
    )
  }

  const token = await new SignJWT({
    // Role do POSTGRES (não o perfil da aplicação) — é ela que a policy
    // `to authenticated` exige.
    role: 'authenticated',
    // Claim consumido pela policy de helena_cards.
    account_id: ctx.user.accountId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ctx.user.sub)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret))

  return ok({ token, expiresIn: TTL_SECONDS })
}, ['admin', 'receptionist', 'dentist'])
