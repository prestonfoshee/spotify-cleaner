import http from 'http'

export interface Artist {
  id: string
  name: string
}

export interface Playlist {
  id: string
  name: string
}

export interface Server
  extends http.Server<
    typeof http.IncomingMessage,
    typeof http.ServerResponse
  > {}
