// =============================================================================
// FreelanceTM API Load Test (k6)
// =============================================================================
// Usage:
//   k6 run --env API_URL=https://your-api.com/api --env TOKEN=your_jwt scripts/k6/api-load-test.js
//
// Scenarios:
//   - Smoke: 1 VU, 60s (sanity check)
//   - Load: 50 VU, ramp up 2m, sustain 5m, ramp down 2m
//   - Stress: 200 VU, burst 30s
// =============================================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';
const TOKEN = __ENV.TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '60s',
      tags: { test_type: 'smoke' },
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '2m', target: 50 },   // ramp up
        { duration: '5m', target: 50 },  // sustain
        { duration: '2m', target: 0 },    // ramp down
      ],
      tags: { test_type: 'load' },
    },
    stress: {
      executor: 'constant-vus',
      vus: 200,
      duration: '30s',
      tags: { test_type: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% requests under 500ms
    http_req_failed: ['rate<0.01'],   // error rate < 1%
  },
};

export default function () {
  group('Health & Public', () => {
    const health = http.get(`${BASE_URL}/healthz`);
    check(health, {
      'health status is 200': (r) => r.status === 200,
      'health response < 200ms': (r) => r.timings.duration < 200,
    });

    const gigs = http.get(`${BASE_URL}/gigs?page=1&limit=20`);
    check(gigs, {
      'gigs status is 200': (r) => r.status === 200,
      'gigs response < 300ms': (r) => r.timings.duration < 300,
    });

    const stats = http.get(`${BASE_URL}/gigs/stats`);
    check(stats, {
      'stats status is 200': (r) => r.status === 200,
    });
  });

  if (TOKEN) {
    group('Authenticated', () => {
      const me = http.get(`${BASE_URL}/users/me`, { headers });
      check(me, {
        'me status is 200': (r) => r.status === 200,
      });

      const myOrders = http.get(`${BASE_URL}/orders`, { headers });
      check(myOrders, {
        'orders status is 200': (r) => r.status === 200,
      });

      const notifications = http.get(`${BASE_URL}/notifications/unread-count`, { headers });
      check(notifications, {
        'notifications status is 200': (r) => r.status === 200,
      });
    });
  }

  sleep(1);
}
