import { calculateProjectStats } from '../dist/index.js';

function test() {
  const mockHistory = [
    { rating: 5 },
    { rating: 4 },
    { rating: 0 },
    { rating: undefined },
    { rating: null },
    { rating: 'did-not-listen' },
  ];

  const stats = calculateProjectStats(mockHistory);
  console.log('Stats:', stats);

  const { albumsGenerated, albumsRated, albumsUnrated } = stats;

  if (albumsGenerated !== 6) throw new Error(`Expected 6 albumsGenerated, got ${albumsGenerated}`);
  if (albumsRated !== 2) throw new Error(`Expected 2 albumsRated, got ${albumsRated}`);
  if (albumsUnrated !== 4) throw new Error(`Expected 4 albumsUnrated, got ${albumsUnrated}`);

  if (albumsGenerated !== albumsRated + albumsUnrated) {
    throw new Error(`Regression: albumsGenerated (${albumsGenerated}) !== albumsRated (${albumsRated}) + albumsUnrated (${albumsUnrated})`);
  }

  console.log('Regression test passed!');
}

try {
  test();
} catch (error) {
  console.error('Regression test failed:', error.message);
  process.exit(1);
}
