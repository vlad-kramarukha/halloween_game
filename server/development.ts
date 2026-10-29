import type { IncomingMessage } from 'node:http';

function isLoopback(value: string): boolean {
  return value === 'localhost' || value === '127.0.0.1' || value === '[::1]' || value === '::1' || value === '::ffff:127.0.0.1';
}

/** Development exceptions are limited to local connections and local browser URLs. */
export function isLocalDevelopment(request: IncomingMessage): boolean {
  if (!isLoopback(request.socket.remoteAddress ?? '')) return false;
  try {
    if (!isLoopback(new URL('http://' + request.headers.host).hostname)) return false;
    const origin = request.headers.origin;
    return !origin || isLoopback(new URL(origin).hostname);
  } catch { return false; }
}