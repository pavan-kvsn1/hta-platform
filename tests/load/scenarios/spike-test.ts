/**
 * k6 Load Test - Spike Test
 *
 * Tests API resilience under sudden traffic spikes.
 * Run with: k6 run tests/load/scenarios/spike-test.ts
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Rate, Counter } from 'k6/metrics'

const requestDuration = new Trend('request_duration', true)
const errorRate = new Rate('errors')
const requestCount = new Counter('requests')

export const options = {
  scenarios: {
    spike_test: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      stages: [
        { duration: '1m', target: 10 }, // Warm up
        { duration: '2m', target: 50 }, // Normal load
        { duration: '30s', target: 200 }, // Spike!
        { duration: '2m', target: 200 }, // Sustained spike
        { duration: '30s', target: 50 }, // Recovery
        { duration: '2m', target: 50 }, // Back to normal
        { duration: '1m', target: 10 }, // Cool down
      ],
      preAllocatedVUs: 100,
      maxVUs: 300,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'], // Allow 5% failures during spike
    errors: ['rate<0.05'],
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

  group('Spike Test - Mixed Operations', () => {
    // Health check
    const healthRes = http.get(`${BASE_URL}/health`)
    requestCount.add(1)
    check(healthRes, {
      'health check ok': (r) => r.status === 200,
    })

    sleep(0.1)

    // Certificate list
    const start = Date.now()
    const listRes = http.get(`${BASE_URL}/api/certificates`, { headers })
    requestDuration.add(Date.now() - start)
    requestCount.add(1)

    const success = check(listRes, {
      'list status ok': (r) => r.status === 200 || r.status === 401,
      'list response time ok': (r) => r.timings.duration < 500,
    })

    if (!success) errorRate.add(1)

    sleep(0.1)

    // Occasional write operation (10% of requests)
    if (Math.random() < 0.1) {
      const createRes = http.post(
        `${BASE_URL}/api/certificates`,
        JSON.stringify({
          customerName: `Spike Test ${Date.now()}`,
          equipmentType: 'PRESSURE_GAUGE',
          serialNumber: `SPIKE-${Date.now()}`,
        }),
        { headers }
      )
      requestCount.add(1)

      const createSuccess = check(createRes, {
        'create status ok': (r) => r.status === 201 || r.status === 401,
      })

      if (!createSuccess) errorRate.add(1)
    }
  })

  // Short sleep to maintain request rate
  sleep(Math.random() * 0.5 + 0.1)
}

export function setup() {
  console.log(`Starting spike test against ${BASE_URL}`)

  const res = http.get(`${BASE_URL}/health`)
  if (res.status !== 200) {
    throw new Error(`API is not healthy: ${res.status}`)
  }

  return { startTime: new Date().toISOString() }
}

export function teardown(data: { startTime: string }) {
  console.log(`Spike test completed`)
  console.log(`Started at: ${data.startTime}`)
  console.log(`Ended at: ${new Date().toISOString()}`)
}
