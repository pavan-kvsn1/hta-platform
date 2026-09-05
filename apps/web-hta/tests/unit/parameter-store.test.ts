/**
 * Loading the parameters this lab calibrates.
 *
 * Every certificate form asks for the same list at the same moment, so the store has to
 * hold it, share one request between callers, and be honest when it has nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../setup'
import { useParameterStore, resetParameterStore } from '@/lib/stores/parameter-store'
import { clearAccessToken } from '@/lib/api-client'

const URL = 'http://localhost:3000/api/calibration-parameters'

const body = (over: Record<string, unknown> = {}) => ({
  parameters: [
    {
      id: 'rtd',
      standardName: 'RTD',
      customName: 'Platinum RTD',
      category: 'Temperature',
      units: ['°C'],
      defaultUnit: '°C',
      subtypes: ['Pt-100'],
      aliases: [],
      source: 'registry',
      active: true,
    },
  ],
  ...over,
})

beforeEach(() => {
  resetParameterStore()
  clearAccessToken()
  server.use(
    http.post('/api/auth/issue-refresh-token', () =>
      HttpResponse.json({ accessToken: 'token', expiresIn: 900 }),
    ),
  )
})

describe('loading the list', () => {
  it('holds what the API returned', async () => {
    server.use(http.get(URL, () => HttpResponse.json(body())))

    await useParameterStore.getState().load()

    const state = useParameterStore.getState()
    expect(state.isLoaded).toBe(true)
    expect(state.parameters).toHaveLength(1)
    expect(state.parameters[0].customName).toBe('Platinum RTD')
    expect(state.error).toBeNull()
  })

  it('asks once, however many components want it', async () => {
    // The UUC section, the master filtering and the results table all ask on mount.
    let asked = 0
    server.use(
      http.get(URL, () => {
        asked += 1
        return HttpResponse.json(body())
      }),
    )

    await Promise.all([
      useParameterStore.getState().load(),
      useParameterStore.getState().load(),
      useParameterStore.getState().load(),
    ])

    expect(asked).toBe(1)
    expect(useParameterStore.getState().parameters).toHaveLength(1)
  })

  it('does not ask again once it has the list', async () => {
    let asked = 0
    server.use(
      http.get(URL, () => {
        asked += 1
        return HttpResponse.json(body())
      }),
    )

    await useParameterStore.getState().load()
    await useParameterStore.getState().load()

    expect(asked).toBe(1)
  })

  it('does ask again when told to', async () => {
    // After an admin renames one.
    let asked = 0
    server.use(
      http.get(URL, () => {
        asked += 1
        return HttpResponse.json(body())
      }),
    )

    await useParameterStore.getState().load()
    await useParameterStore.getState().reload()

    expect(asked).toBe(2)
  })
})

describe('when the list cannot be had', () => {
  it('says so rather than reporting an empty lab', async () => {
    // A lab with no parameters and a lab whose API is down look identical otherwise,
    // and only one of them is a reason to stop.
    server.use(http.get(URL, () => HttpResponse.json({ error: 'boom' }, { status: 500 })))

    await useParameterStore.getState().load()

    const state = useParameterStore.getState()
    expect(state.isLoaded).toBe(false)
    expect(state.parameters).toEqual([])
    expect(state.error).toContain('500')
  })

  it('tries again on the next attempt', async () => {
    let asked = 0
    server.use(
      http.get(URL, () => {
        asked += 1
        return asked === 1
          ? HttpResponse.json({ error: 'boom' }, { status: 500 })
          : HttpResponse.json(body())
      }),
    )

    await useParameterStore.getState().load()
    await useParameterStore.getState().load()

    expect(asked).toBe(2)
    expect(useParameterStore.getState().isLoaded).toBe(true)
  })

  it('treats a response with no parameters as an empty list, not a failure', async () => {
    server.use(http.get(URL, () => HttpResponse.json({})))

    await useParameterStore.getState().load()

    expect(useParameterStore.getState().isLoaded).toBe(true)
    expect(useParameterStore.getState().parameters).toEqual([])
  })
})

describe('after an admin renames one', () => {
  it('shows the new name without a round trip', async () => {
    server.use(http.get(URL, () => HttpResponse.json(body())))
    await useParameterStore.getState().load()

    useParameterStore.getState().replace({
      ...useParameterStore.getState().parameters[0],
      customName: 'Temp Reference',
    })

    expect(useParameterStore.getState().parameters[0].customName).toBe('Temp Reference')
  })

  it('leaves the others alone', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json(
          body({
            parameters: [
              ...body().parameters,
              { ...body().parameters[0], id: 'tc', customName: 'Thermocouple' },
            ],
          }),
        ),
      ),
    )
    await useParameterStore.getState().load()

    useParameterStore.getState().replace({
      ...useParameterStore.getState().parameters[0],
      customName: 'Renamed',
    })

    const names = useParameterStore.getState().parameters.map((p) => p.customName)
    expect(names).toEqual(['Renamed', 'Thermocouple'])
  })
})
