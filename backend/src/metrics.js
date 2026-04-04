import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'msxcrm_' });

// HTTP request counter
export const httpRequests = new client.Counter({
  name: 'msxcrm_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// HTTP response duration
export const httpDuration = new client.Histogram({
  name: 'msxcrm_http_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// Active WebSocket connections
export const wsConnections = new client.Gauge({
  name: 'msxcrm_ws_connections',
  help: 'Active Socket.io connections',
  registers: [register],
});

// BullMQ queue sizes
export const queueSize = new client.Gauge({
  name: 'msxcrm_queue_jobs',
  help: 'BullMQ queue job counts',
  labelNames: ['queue', 'state'],
  registers: [register],
});

export { register };
