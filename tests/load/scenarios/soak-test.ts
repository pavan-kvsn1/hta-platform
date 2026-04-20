/**
 * k6 Load Test - Soak Test
 *
 * Tests API stability over extended periods.
 * Run with: k6 run tests/load/scenarios/soak-test.ts --duration 1h
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Rate, Counter, Gauge } from 'k6/metrics'

const requestDuration = new Trend('request_duration', true)
const errorRate = new Rate('errors')
const requestCount = new Counter('requests')
const activeVUs = new Gauge('active_vus')

export const options = {
  scenarios: {
    soak_test: {
      executor: 'constant-arrival-rate',
      rate: 30, // 30 requests per second
      duration: '1h', // 1 hour soak test
      preAllocatedVUs: 15,
      maxVUs: 30,
    },
  },
  thresholds: {
    // Strict thresholds for soak test - looking for memory leaks, connection issues
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],

    // No degradation over time
    request_duration: ['p(95)<200'],
  },
}

const BASE_URL = __ENV.API_URL || 'http://localhost:4000'
const TOKEN = __ENV.AUTH_TOKEN || ''

function getHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (TOKEN) {
    headers['Authorization'] = `Bearer ${TOKEN}`
  }
  return headers
}

export default function () {
  const headers = getHeaders()

  activeVUs.add(__VU)

  group('Soak Test - Standard Operations', () => {
    // Health check - monitors for degradation
    const healthStart = Date.now()
    const healthRes = http.get(`${BASE_URL}/health`)
    const healthDuration = Date.now() - healthStart
    requestCount.add(1)

    const healthOk = check(healthRes, {
      'health: status 200': (r) => r.status === 200,
      'health: fast response': (r) => r.timings.duration < 100,
    })

    if (!healthOk) {
      errorRate.add(1)
      console.warn(`Health check degraded: ${healthDuration}ms`)
    }

    sleep(0.5)

    // Certificate list - main operation
    const start = Date.now()
    const listRes = http.get(`${BASE_URL}/api/certificates?page=1&limit=20`, { headers })
    const duration = Date.now() - start
    requestDuration.add(duration)
    requestCount.add(1)

    const success = check(listRes, {
      'list: status ok': (r) => r.status === 200 || r.status === 401,
      'list: response < 200ms': (r) => r.timings.duration < 200,
      'list: no server errors': (r) => r.status < 500,
    })

    if (!success) {
      errorRate.add(1)
      console.warn(`Certificate list degraded: ${duration}ms, status: ${listRes.status}`)
    }

    sleep(0.5)

    // Dashboard stats - cached endpoint
    const statsRes = http.get(`${BASE_URL}/api/dashboard/stats`, { headers })
    requestCount.add(1)

    check(statsRes, {
      'stats: status ok': (r) => r.status === 200 || r.status === 401,
    })

    sleep(0.5)

    // Occasional create (2% of requests)
    if (Math.random() < 0.02) {
      const createRes = http.post(
        `${BASE_URL}/api/certificates`,
        JSON.stringify({
          customerName: `Soak Test ${Date.now()}`,
          equipmentType: 'PRESSURE_GAUGE',
          serialNumber: `SOAK-${Date.now()}`,
        }),
        { headers }
      )
      requestCount.add(1)

      check(createRes, {
        'create: status ok': (r) => r.status === 201 || r.status === 401,
      })
    }
  })

  // Steady pacing
  sleep(1)
}

export function setup() {
  console.log(`Starting soak test against ${BASE_URL}`)
  console.log(`Duration: 1 hour`)
  console.log(`Rate: 30 req/s`)

  const res = http.get(`${BASE_URL}/health`)
  if (res.status !== 200) {
    throw new Error(`API is not healthy: ${res.status}`)
  }

  return {
    startTime: new Date().toISOString(),
    initialHealth: res.timings.duration,
  }
}

export function teardown(data: { startTime: string; initialHealth: number }) {
  // Final health check to compare with initial
  const finalRes = http.get(`${BASE_URL}/health`)
  const finalHealth = finalRes.timings.duration

  console.log(`Soak test completed`)
  console.log(`Started at: ${data.startTime}`)
  console.log(`Ended at: ${new Date().toISOString()}`)
  console.log(`Initial health check: ${data.initialHealth}ms`)
  console.log(`Final health check: ${finalHealth}ms`)

  const degradation = finalHealth - data.initialHealth
  if (degradation > 50) {
    console.warn(`WARNING: Health check degraded by ${degradation}ms - possible memory leak`)
  }
}
