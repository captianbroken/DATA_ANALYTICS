import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';

const PORT = Number(process.env.RTSP_TEST_PORT || 5050);
const HOST = process.env.RTSP_TEST_HOST || '0.0.0.0';
const ALLOWED_ORIGIN = process.env.RTSP_TEST_ORIGIN || '*';
const MAX_BODY_BYTES = 64 * 1024;

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString('utf8');
    if (body.length > MAX_BODY_BYTES) {
      reject(new Error('Request body too large.'));
    }
  });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const validateRtspUrl = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'rtsp:' || !parsed.hostname) {
      return { ok: false, message: 'Invalid RTSP URL format.' };
    }
    return { ok: true, message: '' };
  } catch {
    return { ok: false, message: 'Invalid RTSP URL format.' };
  }
};

const testRtspConnection = (rtspUrl, timeoutMs = 4000) => new Promise((resolve) => {
  let settled = false;
  const done = (result) => {
    if (settled) return;
    settled = true;
    resolve(result);
  };

  let parsed;
  try {
    parsed = new URL(rtspUrl);
  } catch {
    done({ ok: false, message: 'Invalid RTSP URL format.' });
    return;
  }

  const port = Number(parsed.port || 554);
  const socket = net.createConnection({ host: parsed.hostname, port });

  const timeoutId = setTimeout(() => {
    socket.destroy();
    done({ ok: false, message: 'RTSP connection timed out.' });
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);
    socket.removeAllListeners();
  };

  socket.on('error', (err) => {
    cleanup();
    done({ ok: false, message: `RTSP connection error: ${err.message}` });
  });

  socket.on('connect', () => {
    const request = [
      `OPTIONS ${rtspUrl} RTSP/1.0`,
      'CSeq: 1',
      'User-Agent: hyperspark-rtsp-test',
      '',
      '',
    ].join('\r\n');
    socket.write(request);
  });

  socket.on('data', (data) => {
    cleanup();
    const text = data.toString('utf8');
    const firstLine = text.split('\r\n')[0] || '';
    if (!firstLine.startsWith('RTSP/1.0')) {
      done({ ok: false, message: 'No RTSP response received.' });
      socket.destroy();
      return;
    }

    const statusCode = Number(firstLine.split(' ')[1] || 0);
    if (statusCode >= 200 && statusCode < 400) {
      done({ ok: true, message: `RTSP response received (${firstLine}).` });
    } else if (statusCode === 401) {
      done({ ok: true, message: 'RTSP server reachable but authentication is required.' });
    } else {
      done({ ok: false, message: `RTSP response error (${firstLine}).` });
    }
    socket.destroy();
  });
});

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/rtsp-test') {
    sendJson(res, 404, { ok: false, message: 'Not found.' });
    return;
  }

  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || '{}');
    const rtspUrl = String(payload?.url || '').trim();

    const validation = validateRtspUrl(rtspUrl);
    if (!validation.ok) {
      sendJson(res, 400, { ok: false, message: validation.message });
      return;
    }

    const result = await testRtspConnection(rtspUrl);
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 500, { ok: false, message: err instanceof Error ? err.message : 'Unexpected error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`RTSP test server listening on http://${HOST}:${PORT}`);
});
