export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Review pages now use the same layout as dashboard (sidebar + banner)
  return <>{children}</>
}
