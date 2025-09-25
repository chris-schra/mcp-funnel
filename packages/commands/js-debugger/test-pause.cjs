const { spawn } = require('child_process');
const WebSocket = require('ws');

async function test() {
  // Create a simple test script
  const fs = require('fs');
  const testScript = '/tmp/test-pause.js';
  fs.writeFileSync(testScript, 'console.log("Hello"); process.exit(0);');

  // Spawn with --inspect-brk
  const proc = spawn('node', [`--inspect-brk=9299`, testScript], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Wait for inspector URL and extract it
  let url = null;
  await new Promise(resolve => {
    const handler = (data) => {
      const output = data.toString();
      console.log('STDERR:', output);
      const match = output.match(/Debugger listening on (ws:\/\/[^\s]+)/);
      if (match) {
        url = match[1];
        resolve();
      }
    };
    proc.stderr.on('data', handler);
  });

  console.log('Using URL:', url);

  // Connect
  const ws = new WebSocket(url);

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  console.log('Connected to WebSocket');

  // Listen for messages
  let messageId = 1;
  const messages = [];

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('MESSAGE:', JSON.stringify(msg, null, 2));
    messages.push(msg);
  });

  // Send Debugger.enable
  const enableId = messageId++;
  console.log('Sending Debugger.enable...');
  ws.send(JSON.stringify({
    id: enableId,
    method: 'Debugger.enable'
  }));

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check if we got a pause event
  const pauseEvents = messages.filter(m => m.method === 'Debugger.paused');
  console.log(`Found ${pauseEvents.length} pause events`);

  // Cleanup
  ws.close();
  proc.kill();
}

test().catch(console.error);