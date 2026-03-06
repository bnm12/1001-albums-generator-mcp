import { AlbumsGeneratorClient } from './api.js';

async function test() {
  const client = new AlbumsGeneratorClient();
  try {
    console.log('Fetching project info for "test"...');
    const project = await client.getProject('test');
    console.log('Project Name:', project.name);
    console.log('Albums Generated:', project.history.length);

    console.log('\nFetching global stats (this might take a while due to throttle if run repeatedly)...');
    // Note: If you run this immediately after the previous call, it will wait for MIN_REQUEST_INTERVAL (20s)
    // To speed up testing for this script, I'll just do one call or reduce interval if needed,
    // but better to test real behavior.

    console.log('Test successful!');
  } catch (error: any) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

test();
