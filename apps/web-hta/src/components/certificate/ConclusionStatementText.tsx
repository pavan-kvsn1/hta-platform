import { getConclusionText } from '@/components/pdf/pdf-utils'

const OUT_OF_ACCURACY_MARKER = '"*"'

interface ConclusionStatementTextProps {
  statementKey?: string
  text?: string
}

export function ConclusionStatementText({ statementKey, text }: ConclusionStatementTextProps) {
  const statement = text ?? (statementKey ? getConclusionText(statementKey) : '')

  if (!statement.startsWith(OUT_OF_ACCURACY_MARKER)) {
    return <>{statement}</>
  }

  return (
    <>
      <span className="font-bold text-red-700">{OUT_OF_ACCURACY_MARKER}</span>
      {statement.slice(OUT_OF_ACCURACY_MARKER.length)}
    </>
  )
}
