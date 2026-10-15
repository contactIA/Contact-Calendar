import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

export type JwtPayload = {
  sub: string       // userId (ou 'ai_agent')
  accountId: string
  role: 'admin' | 'receptionist' | 'dentist' | 'ai_agent'
  iat?: number
  exp?: number
}

export async function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresIn: string) {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as JwtPayload
}
