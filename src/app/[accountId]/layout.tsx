'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = use(params)
  const searchParams  = useSearchParams()
  const userId        = searchParams.get('userId')
  const auth          = useAuth(accountId, userId)

  if (auth.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  if (auth.status === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold text-gray-800 mb-1">Acesso negado</p>
          <p className="text-sm text-gray-500">{auth.message}</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
