import { redirect } from 'next/navigation'

export default async function AccountRoot({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { accountId } = await params
  const sp = await searchParams
  const userId = sp.userId ? `?userId=${encodeURIComponent(sp.userId)}` : ''
  redirect(`/${accountId}/agenda${userId}`)
}
