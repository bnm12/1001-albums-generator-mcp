import { AlbumsGeneratorClient } from './api.js';

async function test() {
  const client = new AlbumsGeneratorClient();
  try {
    console.log('--- Initial Fetch (should hit API) ---');
    const start1 = Date.now();
    const p1 = await client.getProject('test');
    console.log(`Fetched project in ${Date.now() - start1}ms`);

    console.log('\n--- Second Fetch (should hit cache) ---');
    const start2 = Date.now();
    const p2 = await client.getProject('test');
    console.log(`Fetched project in ${Date.now() - start2}ms`);
    if (Date.now() - start2 < 100) {
      console.log('Cache hit confirmed!');
    } else {
      console.log('Cache hit failed or was slow.');
    }

    console.log('\n--- Force Refresh Fetch (should hit API and wait for throttle) ---');
    console.log('Waiting for throttle (20s)...');
    const start3 = Date.now();
    const p3 = await client.getProject('test', true);
    console.log(`Fetched project with refresh in ${Date.now() - start3}ms`);

    console.log('\nTest successful!');
  } catch (error: any) {
    console.error('Test failed:', error.message);
  }
}

test();
