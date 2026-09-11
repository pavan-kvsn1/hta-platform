'use client'

import { use } from 'react'
import InstrumentDetail from './InstrumentDetail'

export default function InstrumentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <InstrumentDetail id={id} />
}
