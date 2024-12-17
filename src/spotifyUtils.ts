import axios, { AxiosResponse } from 'axios'
import { config } from 'dotenv'
import querystring from 'querystring'
import http from 'http'
import url from 'url'
import fs from 'fs'

config()

const clientId: string | undefined = process.env.SPOTIFY_CLIENT_ID
const clientSecret: string | undefined = process.env.SPOTIFY_CLIENT_SECRET
const redirectUri: string | undefined = process.env.SPOTIFY_REDIRECT_URI
const scopes: string = 'user-library-read'
const open = import('open')

export const getSpotifyToken = async (): Promise<string> => {
  if (!clientId || !clientSecret) {
    throw new Error('Missing Spotify client ID or client secret')
  }

  try {
    const response: AxiosResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${clientId}:${clientSecret}`
          ).toString('base64')}`,
        },
      }
    )

    return response.data.access_token
  } catch (error: any) {
    console.error(
      'Error fetching Spotify token:',
      error.response?.data || error.message
    )
    throw error
  }
}

export const searchArtist = async (artistName: string, token: string) => {
  const response = await axios.get(
    `https://api.spotify.com/v1/search?q=${artistName}&type=artist`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  )

  return response.data.artists.items[0]
}

// new function with batching
export const getLikedSongs = async () => {
  const token: string = await authenticateUser()
  const limit: number = 50
  const allLikedSongs: string[] = []

  try {
    // Fetch the total number of liked songs
    const { data: initialResponse }: AxiosResponse = await axios.get(
      'https://api.spotify.com/v1/me/tracks',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: { limit: 1, offset: 0 },
      }
    )

    const total: number = initialResponse.total
    console.log(`Total liked songs: ${total}`)

    // Calculate the number of pages needed
    const numPages: number = Math.ceil(total / limit)
    console.log(`Fetching data in ${numPages} pages...`)

    // Generate offsets for all pages
    const offsets: number[] = Array.from(
      { length: numPages },
      (_, i) => i * limit
    )

    // Helper function to fetch a single page
    const fetchPage = async (offset: number): Promise<string[]> => {
      try {
        const { data } = await axios.get(
          'https://api.spotify.com/v1/me/tracks',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            params: { limit, offset },
          }
        )
        console.log(`Fetched ${data.items.length} songs for offset ${offset}`)
        return data.items.map((item: any) => item.track.name)
      } catch (error: any) {
        const status = error.response?.status
        if (status === 429) {
          const retryAfter = parseInt(
            error.response.headers['retry-after'] || '1',
            10
          )
          console.warn(`Rate limited. Retrying after ${retryAfter} seconds.`)
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
          return fetchPage(offset) // Retry the same offset
        }
        console.error(
          `Error fetching songs for offset ${offset}:`,
          error.message
        )
        return []
      }
    }

    // Batch fetch requests to avoid exceeding rate limits
    const concurrency: number = 5 // Limit to 5 concurrent requests
    for (let i = 0; i < offsets.length; i += concurrency) {
      const batch: number[] = offsets.slice(i, i + concurrency)
      const results: string[][] = await Promise.all(batch.map(fetchPage))
      results.forEach((songs) => allLikedSongs.push(...songs))
    }

    console.log(`Total songs fetched: ${allLikedSongs.length}`)

    // Write all liked songs to a JSON file
    fs.writeFileSync(
      'tmp/likedSongs.json',
      JSON.stringify(allLikedSongs, null, 2)
    )
  } catch (error: any) {
    console.error(
      'Error fetching liked songs:',
      error.response?.data || error.message
    )
    return []
  }

  return allLikedSongs
}

// old function without batching

// export const getLikedSongs = async () => {
//   const token = await authenticateUser();

//   const allLikedSongs: string[] = [];
//   let offset = 0;
//   const limit = 50;

//   let total = 0;

//   while (true) {
//     console.log(`Starting iteration with offset: ${offset}`);

//     try {
//       const response = await axios.get("https://api.spotify.com/v1/me/tracks", {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//         params: {
//           limit: limit,
//           offset: offset,
//         },
//       });

//       const { items } = response.data;
//       if (offset === 0) {
//         total = response.data.total;
//         console.log(`Total liked songs: ${total}`);
//       }

//       if (!items || items.length === 0) {
//         console.log("No items returned. Breaking loop.");
//         break;
//       }

//       console.log(`Fetched ${items.length} songs, offset: ${offset}`);
//       items.forEach((item: any) => {
//         allLikedSongs.push(item.track.name);
//       });

//       offset += items.length;

//       console.log(
//         `Updated offset: ${offset}, Total fetched: ${allLikedSongs.length}`
//       );
//       if (allLikedSongs.length >= total) {
//         console.log("Fetched all songs. Exiting loop.");
//         break;
//       }
//     } catch (error: any) {
//       console.error(
//         "Error occurred during API call:",
//         error.response?.data || error.message
//       );
//       return []; // Exit on error
//     }
//   }

//   fs.writeFileSync(
//     "tmp/likedSongs.json",
//     JSON.stringify(allLikedSongs, null, 2)
//   );
//   return allLikedSongs;
// };

const authenticateUser = (): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    if (!clientId || !clientSecret || !redirectUri) {
      console.error('Missing Spotify client ID, client secret, or redirect URI')
      reject(
        new Error('Missing Spotify client ID, client secret, or redirect URI')
      )
      return
    }
    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(
      scopes
    )}&redirect_uri=${encodeURIComponent(redirectUri)}`

    console.log('Opening browser for Spotify authentication...')
    ;(await open).default(authUrl)

    const server = http.createServer(async (req, res) => {
      if (req.url) {
        const queryObject = url.parse(req.url, true).query
        const authCode = queryObject.code

        if (authCode) {
          const tokenUrl = 'https://accounts.spotify.com/api/token'

          try {
            const response = await axios.post(
              tokenUrl,
              querystring.stringify({
                grant_type: 'authorization_code',
                code: authCode,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
              }
            )

            const accessToken = response.data.access_token
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('Authentication successful! You can close this window.')

            server.close()
            resolve(accessToken)
          } catch (error: any) {
            console.error(
              'Error obtaining access token:',
              error.response?.data || error.message
            )
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Error obtaining access token')
            server.close()
            reject(error)
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('No authorization code found')
          server.close()
          reject(new Error('No authorization code found'))
        }
      }
    })

    server.listen(8888, () => {
      console.log('Server running at http://localhost:8888')
    })
  })
}
