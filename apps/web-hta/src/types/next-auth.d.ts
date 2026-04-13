import { DefaultSession, DefaultUser } from 'next-auth'
import { DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
      isAdmin?: boolean
      adminType?: 'MASTER' | 'WORKER' | null  // NEW: Admin tier (null for non-admins)
      companyName?: string
      customerAccountId?: string
      isPrimaryPoc?: boolean  // For customer users: true if they are the primary POC
    }
  }

  interface User extends DefaultUser {
    id: string
    role: string
    isAdmin?: boolean
    adminType?: 'MASTER' | 'WORKER' | null  // NEW: Admin tier
    companyName?: string
    customerAccountId?: string
    isPrimaryPoc?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string
    role?: string
    isAdmin?: boolean
    adminType?: 'MASTER' | 'WORKER' | null  // NEW: Admin tier
    companyName?: string
    customerAccountId?: string
    isPrimaryPoc?: boolean
  }
}
