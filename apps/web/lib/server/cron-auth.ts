type CronAuthorizationOptions = {
  cronSecret?: string;
  nodeEnv?: string;
};

export function isCronRequestAuthorized(request: Request, options: CronAuthorizationOptions = {}) {
  const secret = (options.cronSecret ?? process.env.CRON_SECRET)?.trim();
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  if (secret) {
    const authHeader = request.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
  }

  if (nodeEnv === 'production') {
    return false;
  }

  return Boolean(request.headers.get('x-vercel-cron'));
}
