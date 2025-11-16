/* eslint-disable no-debugger */
const doubleValue = (input: number): number => input * 2;

interface ResultPayload {
  original: number;
  doubled: number;
}

const payload: ResultPayload = {
  original: 21,
  doubled: doubleValue(21),
};
console.log('Before TS breakpoint', payload.original);
debugger; // Execution should pause here when debugging TypeScript
console.log('TS breakpoint reached', payload.doubled);

setTimeout(() => {
  console.log('TS script exiting');
  process.exit(0);
}, 200);

export {};
