/**
 * What happens when the API says 401.
 *
 * Reported from the chat panel as "Fetch messages failed: 401 Unauthorized". The chain
 * behind it: the cached access token had gone, minting a new one needs a NextAuth
 * session, and where there is none the mint answers 401 - after which the request went
 * out with no Authorization header at all and the API answered 401 for a second,
 * different reason. Every caller then reported the second one.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../setup'
import { apiFetch, clearAccessToken, isSignedOut } from '@/lib/api-client'

const MINT = '/api/auth/issue-refresh-token'
const RESOURCE = 'http://localhost:3000/api/chat/threads/t1/messages'

beforeEach(() => {
  clearAccessToken()
})

describe('when there is no session to mint against', () => {
  it('tells the caller they are signed out, not merely refused', () => {
    // The two are different problems with different remedies, and only one of them is
    // fixed by signing in.
    server.use(
      http.post(MINT, () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })),
      http.get(RESOURCE, () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    return apiFetch('/api/chat/threads/t1/messages').then((res) => {
      expect(res.status).toBe(401)
      expect(isSignedOut()).toBe(true)
    })
  })

  it('does not ask the API twice when it never had a token to send', async () => {
    // Retrying an unauthenticated request just asks the same question again.
    let asked = 0
    server.use(
      http.post(MINT, () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })),
      http.get(RESOURCE, () => {
        asked += 1
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }),
    )
    await apiFetch('/api/chat/threads/t1/messages')
    expect(asked).toBe(1)
  })
})

describe('when the token was simply stale', () => {
  it('mints a new one and asks again, without troubling the reader', async () => {
    // An access token lives minutes and is cached against this machine's clock, so it
    // can pass the local check and still be expired by the time the API reads it.
    let minted = 0
    let asked = 0
    server.use(
      http.post(MINT, () => {
        minted += 1
        return HttpResponse.json({ accessToken: `token-${minted}`, expiresIn: 900 })
      }),
      http.get(RESOURCE, ({ request }) => {
        asked += 1
        const auth = request.headers.get('Authorization')
        // The first token is refused; the replacement is accepted.
        if (auth === 'Bearer token-1') {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return HttpResponse.json({ messages: [], hasMore: false })
      }),
    )

    const res = await apiFetch('/api/chat/threads/t1/messages')

    expect(asked).toBe(2)
    expect(minted).toBe(2)
    expect(res.status).toBe(200)
    expect(isSignedOut()).toBe(false)
  })

  it('gives up after one retry rather than looping', async () => {
    let asked = 0
    server.use(
      http.post(MINT, () => HttpResponse.json({ accessToken: 'always-stale', expiresIn: 900 })),
      http.get(RESOURCE, () => {
        asked += 1
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }),
    )

    const res = await apiFetch('/api/chat/threads/t1/messages')

    expect(asked).toBe(2)
    expect(res.status).toBe(401)
  })
})

describe('when the mint itself cannot be reached', () => {
  it('does not call that being signed out', async () => {
    // Signing in again does not fix a mint that is down, so it must not be suggested.
    server.use(
      http.post(MINT, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      http.get(RESOURCE, () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })),
    )
    await apiFetch('/api/chat/threads/t1/messages')
    expect(isSignedOut()).toBe(false)
  })
})
