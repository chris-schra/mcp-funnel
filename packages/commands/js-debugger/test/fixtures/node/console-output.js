/* eslint-env node */

setTimeout(() => {
  console.log('Test log message');
  console.warn('Test warning message');
  console.error('Test error message');
}, 50);

let count = 0;
const interval = setInterval(() => {
  count += 1;
  console.log('Periodic message', count);
  if (count >= 3) {
    clearInterval(interval);
    setTimeout(() => process.exit(0), 1000);
  }
}, 50);
