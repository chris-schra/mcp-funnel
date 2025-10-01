console.log('Quicktest started');
const main = async () => {
  const myCoolVariable = 42;
  console.log('Quicktest main running');
  // Simulate some async work
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log('Quicktest main completed');
  debugger;
};

main().then();
