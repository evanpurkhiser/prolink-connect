/**
 * Used for control messages with the remote database
 */
export enum ControlRequest {
  Introduce = 0x0000,
  Disconnect = 0x0100,
  RenderMenu = 0x3000,
}

/**
 * Used to setup renders for specific Menus
 */
export enum MenuRequest {
  Root = 0x1000,
  Genre = 0x1001,
  Artist = 0x1002,
  Album = 0x1003,
  Track = 0x1004,
  BPM = 0x1006,
  Rating = 0x1007,
  Year = 0x1008,
  Label = 0x100a,
  Color = 0x100d,
  Time = 0x1010,
  Bitrate = 0x1011,
  History = 0x1012,
  Filename = 0x1013,
  Key = 0x1014,
  OriginalArtist = 0x1302,
  Remixer = 0x1602,
  Playlist = 0x1105,
  ArtistsOfGenre = 0x1101,
  AlbumsOfArtist = 0x1102,
  TracksOfAlbum = 0x1103,
  TracksOfRating = 0x1107,
  YearsOfDecade = 0x1108,
  ArtistsOfLabel = 0x110a,
  TracksOfColor = 0x110d,
  TracksOfTime = 0x1110,
  TracksOfHistory = 0x1112,
  DistancesOfKey = 0x1114,
  AlbumsOfOriginalArtist = 0x1402,
  AlbumsOfRemixer = 0x1702,
  AlbumsOfGenreAndArtist = 0x1201,
  TracksOfArtistAndAlbum = 0x1202,
  TracksOfBPMPercentRange = 0x1206,
  TracksOfDecadeAndYear = 0x1208,
  AlbumsOfLabelAndArtist = 0x120a,
  TracksNearKey = 0x1214,
  TracksOfOriginalArtistAndAlbum = 0x1502,
  TracksOfRemixerAndAlbum = 0x1802,
  TracksOfGenreArtistAndAlbum = 0x1301,
  TracksOfLabelArtistAndAlbum = 0x130a,
  Search = 0x1300,
  Folder = 0x2006,
}

/**
 * Request message types used to obtain specfiic track information
 */
export enum DataRequest {
  GetMetadata = 0x2002,
  GetArtwork = 0x2003,
  GetWaveformPreview = 0x2004,
  GetTrackInfo = 0x2102,
  GetGenericMetadata = 0x2202,
  GetCueAndLoops = 0x2104,
  GetBeatGrid = 0x2204,
  GetWaveformDetailed = 0x2904,
  GetAdvCueAndLoops = 0x2b04,
  GetWaveformHD = 0x2c04,
}

/**
 * Response message types for messages sent back by the server.
 */
export enum Response {
  Success = 0x4000,
  Error = 0x4003,
  Artwork = 0x4002,
  MenuItem = 0x4101,
  MenuHeader = 0x4001,
  MenuFooter = 0x4201,
  BeatGrid = 0x4602,
  CueAndLoops = 0x4702,
  WaveformPreview = 0x4402,
  WaveformDetailed = 0x4a02,
  AdvCueAndLoops = 0x4e02,
  WaveformHD = 0x4f02,
}

/**
 * Request message types, only sent to the device.
 */
export type Request = ControlRequest | MenuRequest | DataRequest;

export const Request = {
  ...ControlRequest,
  ...MenuRequest,
  ...DataRequest,
} as const;

/**
 * All Known message types. These are used for both request and response messages.
 */
export type MessageType = ControlRequest | MenuRequest | DataRequest | Response;

export const MessageType = {
  ...ControlRequest,
  ...MenuRequest,
  ...DataRequest,
  ...Response,
} as const;
