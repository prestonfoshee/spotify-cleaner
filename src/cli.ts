import { Command } from 'commander'
import { config } from 'dotenv'
import { searchArtist, getSpotifyToken, getLikedSongs } from './spotifyUtils'

config()

const program = new Command()

// program
//   .command('create <artistName> <playlistName>')
//   .description('create a new playlist')
//   .action((projectName) => {
//     create(projectName)
//   })

program
  .command('search <artistName>')
  .description('search for an artist')
  .action(async (artistName) => {
    const token = await getSpotifyToken()
    const artist = await searchArtist(artistName, token)
    console.log(artist)
  })

program
  .command('likes')
  .description('get all liked songs')
  .action(async () => {
    const likedSongs = await getLikedSongs()
    console.log(likedSongs)
  })

program.parse(process.argv)
