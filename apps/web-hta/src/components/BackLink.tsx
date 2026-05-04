import Link from 'next/link'
import { auth } from '@/lib/auth'

export async function BackLink() {
  const session = await auth()
  const href = session ? '/dashboard' : '/'
  const label = session ? '\u2190 Back to Dashboard' : '\u2190 Back to Home'

  return (
    <Link
      href={href}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
    </Link>
  )
}
