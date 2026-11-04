export function readServerConfig(env: NodeJS.ProcessEnv) {
  const rawPort = env.PORT ?? '3001';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }

  const production = env.NODE_ENV === 'production';
  const origin = env.CLIENT_ORIGIN?.trim();
  if (!origin) {
    if (production) throw new Error('CLIENT_ORIGIN is required in production');
    return {port, origin: /^http:\/\/(localhost|127\.0\.0\.1):\d+$/};
  }

  let url: URL;
  try { url = new URL(origin); }
  catch { throw new Error('CLIENT_ORIGIN must be a valid HTTP(S) origin'); }
  if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol)
    || (production && url.protocol !== 'https:')) {
    throw new Error('CLIENT_ORIGIN must be a bare origin without a trailing slash (HTTPS in production)');
  }
  return {port, origin};
}
