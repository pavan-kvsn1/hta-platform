/**
 * The icons this page draws.
 *
 * lucide-react covers most of the app, but these carry fixed colours that the
 * section rail reads as state - a green tick, an amber triangle, a grey ring -
 * and sizes tuned to 12.5px body text. Keeping them here means the rail's three
 * states are one import rather than three lucide calls with three class lists.
 */

import type { ReactElement, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { s?: number; w?: number; c?: string }

function S({ s = 14, w = 2, c = 'currentColor', children, ...rest }: P) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const Icon = {
  ok: (p: P) => (
    <S w={2.4} c="#16a34a" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </S>
  ),
  warn: (p: P) => (
    <S w={2.2} c="#d97706" {...p}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </S>
  ),
  dot: (p: P) => (
    <S c="#94a3b8" {...p}>
      <circle cx="12" cy="12" r="8" />
    </S>
  ),
  down: (p: P) => (
    <S {...p}>
      <path d="m6 9 6 6 6-6" />
    </S>
  ),
  pen: (p: P) => (
    <S s={13} {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </S>
  ),
  bin: (p: P) => (
    <S s={13} {...p}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </S>
  ),
  plus: (p: P) => (
    <S s={13} w={2.2} {...p}>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  check: (p: P) => (
    <S s={13} w={2.6} c="#16a34a" {...p}>
      <path d="M20 6 9 17l-5-5" />
    </S>
  ),
  left: (p: P) => (
    <S {...p}>
      <path d="m15 18-6-6 6-6" />
    </S>
  ),
  right: (p: P) => (
    <S {...p}>
      <path d="m9 18 6-6-6-6" />
    </S>
  ),
  file: (p: P) => (
    <S w={1.9} {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </S>
  ),
  shield: (p: P) => (
    <S s={13} {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </S>
  ),
}

export type SectionState = 'ok' | 'warn' | 'dot'
export const RAIL_ICON: Record<SectionState, (p: P) => ReactElement> = {
  ok: Icon.ok,
  warn: Icon.warn,
  dot: Icon.dot,
}
