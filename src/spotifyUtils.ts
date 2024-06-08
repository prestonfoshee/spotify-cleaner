import axios from 'axios'
import { config } from 'dotenv'
import querystring from 'querystring'
import http from 'http'
import url from 'url'
import fs from 'fs'

config()

const clientId = process.env.SPOTIFY_CLIENT_ID
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
const redirectUri: string = process.env.SPOTIFY_REDIRECT_URI as string
const scopes = 'user-library-read'
const open = import('open')

export const getSpotifyToken = async () => {
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
    }
  )

  return response.data.access_token
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

export const getLikedSongs = async () => {
  const token = await authenticateUser()

  const allLikedSongs: any[] = []
  let offset = 0
  const limit = 50

  while (true) {
    try {
      const response = await axios.get('https://api.spotify.com/v1/me/tracks', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          limit: limit,
          offset: offset,
        },
      })
      const items = response.data.items
      // creater array with all liked songs songs names
      items.forEach((item: any) => {
        allLikedSongs.push(item.track.name)
      })
      // allLikedSongs.push(...items.track.name)

      // may need to change this to 0
      if (items.length < 50) {
        break
      }
      offset += limit
    } catch (error: any) {
      console.error(
        'Error fetching liked songs:',
        error.response?.data || error.message
      )
      return []
    }
    // create json file with all liked songs in tmp folder
    fs.writeFileSync(
      'tmp/likedSongs.json',
      JSON.stringify(allLikedSongs, null, 2)
    )
  }
}

const authenticateUser = (): Promise<string> => {
  return new Promise(async (resolve, reject) => {
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
