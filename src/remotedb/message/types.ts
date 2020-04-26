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
  MenuRoot = 0x1000,
  MenuGenre = 0x1001,
  MenuArtist = 0x1002,
  MenuAlbum = 0x1003,
  MenuTrack = 0x1004,
  MenuBPM = 0x1006,
  MenuRating = 0x1007,
  MenuYear = 0x1008,
  MenuLabel = 0x100a,
  MenuColor = 0x100d,
  MenuTime = 0x1010,
  MenuBitrate = 0x1011,
  MenuHistory = 0x1012,
  MenuFilename = 0x1013,
  MenuKey = 0x1014,
  MenuOriginalArtist = 0x1302,
  MenuRemixer = 0x1602,
  MenuPlaylist = 0x1105,
  MenuArtistsOfGenre = 0x1101,
  MenuAlbumsOfArtist = 0x1102,
  MenuTracksOfAlbum = 0x1103,
  MenuTracksOfRating = 0x1107,
  MenuYearsOfDecade = 0x1108,
  MenuArtistsOfLabel = 0x110a,
  MenuTracksOfColor = 0x110d,
  MenuTracksOfTime = 0x1110,
  MenuTracksOfHistory = 0x1112,
  MenuDistancesOfKey = 0x1114,
  MenuAlbumsOfOriginalArtist = 0x1402,
  MenuAlbumsOfRemixer = 0x1702,
  MenuAlbumsOfGenreAndArtist = 0x1201,
  MenuTracksOfArtistAndAlbum = 0x1202,
  MenuTracksOfBPMPercentRange = 0x1206,
  MenuTracksOfDecadeAndYear = 0x1208,
  MenuAlbumsOfLabelAndArtist = 0x120a,
  MenuTracksNearKey = 0x1214,
  MenuTracksOfOriginalArtistAndAlbum = 0x1502,
  MenuTracksOfRemixerAndAlbum = 0x1802,
  MenuTracksOfGenreArtistAndAlbum = 0x1301,
  MenuTracksOfLabelArtistAndAlbum = 0x130a,
  MenuSearch = 0x1300,
  MenuFolder = 0x2006,
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
  CueAndLoop = 0x4702,
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
