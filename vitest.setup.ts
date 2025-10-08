import pino from 'pino';

/*
const testLogger = pino({ level: process.env.LOG_LEVEL || 'warn' });
(['debug', 'info', 'warn', 'error', 'log'] as const).forEach((name) => {
  // eslint-disable-next-line no-console
  console[name] = (...args: unknown[]) => {
    testLogger[name === 'log' ? 'debug' : name]?.(args);
  };
});
*/
