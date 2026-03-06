
import { AlbumsGeneratorClient } from '../dist/api.js';

async function testGroupApi() {
  const client = new AlbumsGeneratorClient();

  console.log('Testing getGroup...');
  try {
    const group = await client.getGroup('test');
    console.log('Group name:', group.name);
    console.log('Members count:', group.members.length);
    console.log('Current album:', group.currentAlbum?.name);
    console.log('Highscore album:', group.allTimeHighscore?.album.name);

    if (group.latestAlbumWithVotes) {
      console.log('Testing getGroupAlbumReviews for latest album...');
      const reviews = await client.getGroupAlbumReviews('test', group.latestAlbumWithVotes.album.uuid);
      console.log('Reviews count:', reviews.reviews.length);
      console.log('First review project:', reviews.reviews[0]?.projectIdentifier);
    }

    console.log('Group API tests passed!');
  } catch (error) {
    console.error('Group API tests failed:', error);
    process.exit(1);
  }
}

testGroupApi();
