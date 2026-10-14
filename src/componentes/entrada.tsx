'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Abrindo, AvisoDeTela } from './aviso-de-tela'
import { guardarTokenDaTela, useTemTokenDaTela } from './cliente/sessao'

export type ResultadoDaEntradaNaTela =
  | { tipo: 'ok'; token: string }
  | { tipo: 'sem_parametros' }
  | {
      tipo: 'recusada'
      motivo: 'parametros_invalidos' | 'fora_da_plataforma' | 'clinica_nao_cadastrada' | 'usuario_sem_papel' | 'muitas_tentativas' | 'indisponivel'
    }

type Motivo = Extract<ResultadoDaEntradaNaTela, { tipo: 'recusada' }>['motivo']

const RECADOS: Record<Motivo, { titulo: string; texto: string }> = {
  parametros_invalidos: {
    titulo: 'Abra a agenda pelo menu da plataforma',
    texto: 'O endereço que abriu esta página não identificou você. Use o item da agenda no menu da plataforma de atendimento.',
  },
  fora_da_plataforma: {
    titulo: 'Abra a agenda pelo menu da plataforma',
    texto: 'Por segurança, a agenda só abre de dentro da plataforma de atendimento. Use o item da agenda no menu.',
  },
  clinica_nao_cadastrada: {
    titulo: 'A agenda ainda não foi ativada para a sua clínica',
    texto: 'Fale com a equipe da ContactIA para ativar a agenda na sua clínica.',
  },
  usuario_sem_papel: {
    titulo: 'Seu usuário ainda não tem acesso à agenda',
    texto: 'Peça para o gestor da clínica ou a equipe da ContactIA vincular o seu usuário à agenda.',
  },
  muitas_tentativas: {
    titulo: 'Muitas tentativas seguidas',
    texto: 'Espere um minuto e abra a agenda de novo pelo menu.',
  },
  indisponivel: {
    titulo: 'A agenda está fora do ar agora',
    texto: 'Tente de novo em alguns minutos. Se continuar, avise a equipe da ContactIA.',
  },
}

/** Para onde vai quem entrou: a agenda do dia. */
const DESTINO = '/agenda'

export function Entrada({ resultado }: { resultado: ResultadoDaEntradaNaTela }) {
  const router = useRouter()
  const temToken = useTemTokenDaTela()
  // Sem parâmetros na URL: quem já tem sessão nesta aba (recarregou a página) volta
  // à agenda; quem não tem precisa abrir pelo menu.
  const semSessao = resultado.tipo === 'sem_parametros' && temToken === false

  useEffect(() => {
    if (resultado.tipo === 'ok') {
      guardarTokenDaTela(resultado.token)
      // replace: os ids da URL do menu saem do histórico da aba.
      router.replace(DESTINO)
    } else if (resultado.tipo === 'sem_parametros' && temToken) {
      router.replace(DESTINO)
    }
  }, [resultado, router, temToken])

  if (resultado.tipo === 'recusada') {
    const recado = RECADOS[resultado.motivo]
    return (
      <AvisoDeTela titulo={recado.titulo}>
        <p>{recado.texto}</p>
      </AvisoDeTela>
    )
  }
  if (semSessao) {
    return (
      <AvisoDeTela titulo="Abra a agenda pelo menu da plataforma">
        <p>A agenda abre de dentro da plataforma de atendimento, já com o seu usuário. Use o item da agenda no menu.</p>
      </AvisoDeTela>
    )
  }
  return <Abrindo />
}
