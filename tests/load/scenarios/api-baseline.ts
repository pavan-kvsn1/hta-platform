/**
 * k6 Load Test - API Baseline
 *
 * Tests API performance under various load conditions.
 * Run with: k6 run tests/load/scenarios/api-baseline.ts
 *
 * Environment variables:
 *   API_URL - API base URL (default: http://localhost:4000)
 *   AUTH_TOKEN - Bearer token for authenticated requests
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Rate, Counter } from 'k6/metrics'

// Custom metrics
const certificateListDuration = new Trend('certificate_list_duration', true)
const certificateCreateDuration = new Trend('certificate_create_duration', true)
const certificateGetDuration = new Trend('certificate_get_duration', true)
const authDuration = new Trend('auth_duration', true)
const healthCheckDuration = new Trend('health_check_duration', true)
const errorRate = new Rate('errors')
const requestCount = new Counter('requests')

// Test configuration
export const options = {
  scenarios: {
    // Normal load - baseline performance
    normal_load: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 requests per second
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'normalLoad',
    },
  },
  thresholds: {
    // Overall thresholds
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],

    // Endpoint-specific thresholds
    certificate_list_duration: ['p(95)<150'],
    certificate_create_duration: ['p(95)<300'],
    certificate_get_duration: ['p(95)<100'],
    auth_duration: ['p(95)<200'],
    health_check_duration: ['p(95)<50'],

    // Error rate threshold
    errors: ['rate<0.01'],
  },
}

// Spike test scenario - run separately
export const spikeOptions = {
  scenarios: {
    spike_test: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      stages: [
        { duration: '2m', target: 50 }, // Normal
        { duration: '30s', target: 200 }, // Spike
        { duration: '2m', target: 200 }, // Sustained spike
        { duration: '30s', target: 50 }, // Recovery
        { duration: '2m', target: 50 }, // Normal
      ],
      preAllocatedVUs: 100,
      maxVUs: 300,
      exec: 'normalLoad',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
}

// Soak test scenario - run separately for longer duration
export const soakOptions = {
  scenarios: {
    soak_test: {
      executor: 'constant-arrival-rate',
      rate: 30,
      duration: '1h',
      preAllocatedVUs: 15,
      maxVUs: 30,
      exec: 'normalLoad',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
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

// Normal load test function
export function normalLoad() {
  const headers = getHeaders()

  // Health check (always run)
  group('Health Check', () => {
    const start = Date.now()
    const res = http.get(`${BASE_URL}/health`)
    healthCheckDuration.add(Date.now() - start)
    requestCount.add(1)

    const success = check(res, {
      'health: status is 200': (r) => r.status === 200,
      'health: response time < 50ms': (r) => r.timings.duration < 50,
    })

    if (!success) errorRate.add(1)
  })

  sleep(0.5)

  // Certificate list (60% of requests)
  if (Math.random() < 0.6) {
    group('GET /api/certificates', () => {
      const start = Date.now()
      const res = http.get(`${BASE_URL}/api/certificates`, { headers })
      certificateListDuration.add(Date.now() - start)
      requestCount.add(1)

      const success = check(res, {
        'list: status is 200': (r) => r.status === 200,
        'list: response time < 200ms': (r) => r.timings.duration < 200,
        'list: returns array': (r) => {
          try {
            const body = JSON.parse(r.body as string)
            return Array.isArray(body) || Array.isArray(body.data)
          } catch {
            return false
          }
        },
      })

      if (!success) errorRate.add(1)
    })
  }

  sleep(0.5)

  // Certificate get by ID (20% of requests)
  if (Math.random() < 0.2) {
    group('GET /api/certificates/:id', () => {
      // Use a placeholder ID - in real tests, use actual IDs from setup
      const testId = 'test-certificate-id'
      const start = Date.now()
      const res = http.get(`${BASE_URL}/api/certificates/${testId}`, { headers })
      certificateGetDuration.add(Date.now() - start)
      requestCount.add(1)

      const success = check(res, {
        'get: status is 200 or 404': (r) => r.status === 200 || r.status === 404,
        'get: response time < 100ms': (r) => r.timings.duration < 100,
      })

      if (!success) errorRate.add(1)
    })
  }

  sleep(0.5)

  // Certificate create (5% of requests)
  if (Math.random() < 0.05) {
    group('POST /api/certificates', () => {
      const payload = JSON.stringify({
        customerName: `Load Test Customer ${Date.now()}`,
        equipmentType: 'PRESSURE_GAUGE',
        serialNumber: `LT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        manufacturer: 'Test Manufacturer',
        model: 'Test Model',
      })

      const start = Date.now()
      const res = http.post(`${BASE_URL}/api/certificates`, payload, { headers })
      certificateCreateDuration.add(Date.now() - start)
      requestCount.add(1)

      const success = check(res, {
        'create: status is 201 or 401': (r) => r.status === 201 || r.status === 401,
        'create: response time < 500ms': (r) => r.timings.duration < 500,
      })

      if (!success) errorRate.add(1)
    })
  }

  sleep(0.5)

  // Dashboard stats (15% of requests)
  if (Math.random() < 0.15) {
    group('GET /api/dashboard/stats', () => {
      const start = Date.now()
      const res = http.get(`${BASE_URL}/api/dashboard/stats`, { headers })
      requestCount.add(1)

      const success = check(res, {
        'stats: status is 200 or 401': (r) => r.status === 200 || r.status === 401,
        'stats: response time < 300ms': (r) => r.timings.duration < 300,
      })

      if (!success) errorRate.add(1)
    })
  }

  // Random sleep between iterations (1-3 seconds)
  sleep(Math.random() * 2 + 1)
}

// Auth flow test (separate scenario)
export function authFlow() {
  group('Auth Flow', () => {
    // Login
    const loginPayload = JSON.stringify({
      email: __ENV.TEST_EMAIL || 'loadtest@example.com',
      password: __ENV.TEST_PASSWORD || 'testpassword',
    })

    const start = Date.now()
    const res = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
    })
    authDuration.add(Date.now() - start)
    requestCount.add(1)

    const success = check(res, {
      'auth: status is 200 or 401': (r) => r.status === 200 || r.status === 401,
      'auth: response time < 300ms': (r) => r.timings.duration < 300,
    })

    if (!success) errorRate.add(1)
  })

  sleep(2)
}

// Default function
export default function () {
  normalLoad()
}

// Setup function - runs once before the test
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`)
  console.log(`Auth token: ${TOKEN ? 'Provided' : 'Not provided'}`)

  // Verify API is reachable
  const res = http.get(`${BASE_URL}/health`)
  if (res.status !== 200) {
    throw new Error(`API is not healthy: ${res.status}`)
  }

  return {
    baseUrl: BASE_URL,
    startTime: new Date().toISOString(),
  }
}

// Teardown function - runs once after the test
export function teardown(data: { baseUrl: string; startTime: string }) {
  console.log(`Load test completed`)
  console.log(`Started at: ${data.startTime}`)
  console.log(`Ended at: ${new Date().toISOString()}`)
}
