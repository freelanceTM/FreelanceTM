// =============================================================================
// FreelanceTM WebSocket Load Test (k6 experimental WebSockets)
// =============================================================================
// Tests concurrent Socket.IO connections and message throughput.
//
// Usage:
//   k6 run --env WS_URL=ws://localhost:3000/messages --env TOKEN=your_jwt scripts/k6/websocket-load-test.js
// =============================================================================

import ws from 'k6/experimental/websockets';
import { check } from 'k6';

const WS_URL = __ENV.WS_URL || 'ws://localhost:3000/messages';
const TOKEN = __ENV.TOKEN || '';

export const options = {
  vus: 100,
  duration: '60s',
  thresholds: {
    ws_messages_sent: ['count > 0'],
    ws_messages_received: ['count > 0'],
  },
};

export default function () {
  const url = TOKEN ? `${WS_URL}?token=${TOKEN}` : WS_URL;
  const socket = new ws.WebSocket(url);

  socket.addEventListener('open', () => {
    // Join an order room (use a test order ID)
    socket.send(JSON.stringify({ event: 'joinOrder', data: { orderId: 1 } }));

    // Send a message
    socket.send(
      JSON.stringify({
        event: 'sendMessage',
        data: {
          orderId: 1,
          content: 'Load test message from k6',
        },
      }),
    );
  });

  socket.addEventListener('message', (e) => {
    check(e.data, {
      'received message': (d) => d && d.length > 0,
    });
    socket.close();
  });

  socket.addEventListener('close', () => {
    // connection closed
  });

  socket.addEventListener('error', (e) => {
    check(null, {
      'no websocket errors': () => false,
    });
  });
}
