console.log("Starting test script");

function testFunction() {
  console.log("Inside test function");
  const x = 10;
  const y = 20;
  const result = x + y;
  console.log(`Result: ${result}`);
  return result;
}

console.log("About to call test function");
const value = testFunction();
console.log(`Final value: ${value}`);
console.log("Script complete");
