import * as Sentry from '@sentry/node';

import {Field, NumberField, StringField} from 'src/remotedb/fields';

/**
 * Item types associated to the MenuItem message type.
 */
export enum ItemType {
  Path = 0x0000,
  Folder = 0x0001,
  AlbumTitle = 0x0002,
  Disc = 0x0003,
  TrackTitle = 0x0004,
  Genre = 0x0006,
  Artist = 0x0007,
  Playlist = 0x0008,
  Rating = 0x000a,
  Duration = 0x000b,
  Tempo = 0x000d,
  Label = 0x000e,
  Key = 0x000f,
  BitRate = 0x0010,
  Year = 0x0011,
  Comment = 0x0023,
  HistoryPlaylist = 0x0024,
  OriginalArtist = 0x0028,
  Remixer = 0x0029,
  DateAdded = 0x002e,
  Unknown01 = 0x002f,
  Unknown02 = 0x002a,

  ColorNone = 0x0013,
  ColorPink = 0x0014,
  ColorRed = 0x0015,
  ColorOrange = 0x0016,
  ColorYellow = 0x0017,
  ColorGreen = 0x0018,
  ColorAqua = 0x0019,
  ColorBlue = 0x001a,
  ColorPurple = 0x001b,

  MenuGenre = 0x0080,
  MenuArtist = 0x0081,
  MenuAlbum = 0x0082,
  MenuTrack = 0x0083,
  MenuPlaylist = 0x0084,
  MenuBPM = 0x0085,
  MenuRating = 0x0086,
  MenuYear = 0x0087,
  MenuRemixer = 0x0088,
  MenuLabel = 0x0089,
  MenuOriginal = 0x008a,
  MenuKey = 0x008b,
  MenuColor = 0x008e,
  MenuFolder = 0x0090,
  MenuSearch = 0x0091,
  MenuTime = 0x0092,
  MenuBit = 0x0093,
  MenuFilename = 0x0094,
  MenuHistory = 0x0095,
  MenuAll = 0x00a0,

  TrackTitleAlbum = 0x0204,
  TrackTitleGenre = 0x0604,
  TrackTitleArtist = 0x0704,
  TrackTitleRating = 0x0a04,
  TrackTitleTime = 0x0b04,
  TrackTitleBPM = 0x0d04,
  TrackTitleLabel = 0x0e04,
  TrackTitleKey = 0x0f04,
  TrackTitleBitRate = 0x1004,
  TrackTitleColor = 0x1a04,
  TrackTitleComment = 0x2304,
  TrackTitleOriginalArtist = 0x2804,
  TrackTitleRemixer = 0x2904,
  TrackTitleDJPlayCount = 0x2a04,
  MenuTrackTitleDateAdded = 0x2e04,
}

/**
 * All items have 12 arguments of these types
 */
type ItemArgs = [
  NumberField, // Parent ID, such as an artist for a track item.
  NumberField, // Main ID, such as rekordbox for a track item.
  NumberField, // Length in bytes of Label 1.
  StringField, // Label 1 main text
  NumberField, // Length in bytes of Label 2.
  StringField, // Label 2 (secondary text, e.g. artist name for playlist entries)
  NumberField<ItemType>,
  NumberField, // Some type of flags
  NumberField, // Only holds artwork ID?
  NumberField,
  NumberField,
  NumberField,
];

/**
 * Convert a message item argument lists to a structured intermediate object
 * for more clear access.
 */
const makeItemData = (args: ItemArgs) => ({
  parentId: args[0].value,
  mainId: args[1].value,
  label1: args[3].value,
  label2: args[5].value,
  type: args[6].value,
  artworkId: args[8].value,
});

type ItemData = ReturnType<typeof makeItemData>;

/**
 * Generic transformer for items that include just an id and label
 */
const mapIdName = (a: ItemData) => ({
  id: a.mainId,
  name: a.label1,
});

/**
 * Maps item types to structured objects
 */
const transformItem = {
  [ItemType.Path]: (a: ItemData) => ({path: a.label1}),
  [ItemType.TrackTitle]: (a: ItemData) => ({
    id: a.mainId,
    title: a.label1,
    artworkId: a.artworkId,
  }),
  [ItemType.AlbumTitle]: mapIdName,
  [ItemType.Artist]: mapIdName,
  [ItemType.Genre]: mapIdName,
  [ItemType.Label]: mapIdName,
  [ItemType.Key]: mapIdName,
  [ItemType.OriginalArtist]: mapIdName,
  [ItemType.Remixer]: mapIdName,
  [ItemType.BitRate]: (a: ItemData) => ({bitrate: a.mainId}),
  [ItemType.Comment]: (a: ItemData) => ({comment: a.label1}),
  [ItemType.Year]: (a: ItemData) => ({year: Number(a.label1)}),
  [ItemType.Rating]: (a: ItemData) => ({rating: a.mainId}),
  [ItemType.Tempo]: (a: ItemData) => ({bpm: a.mainId / 100}),
  [ItemType.Duration]: (a: ItemData) => ({duration: a.mainId}),
  [ItemType.Unknown01]: (_: ItemData) => null,
  [ItemType.Unknown02]: (_: ItemData) => null,

  [ItemType.ColorNone]: mapIdName,
  [ItemType.ColorPink]: mapIdName,
  [ItemType.ColorRed]: mapIdName,
  [ItemType.ColorOrange]: mapIdName,
  [ItemType.ColorYellow]: mapIdName,
  [ItemType.ColorGreen]: mapIdName,
  [ItemType.ColorAqua]: mapIdName,
  [ItemType.ColorBlue]: mapIdName,
  [ItemType.ColorPurple]: mapIdName,

  [ItemType.Folder]: mapIdName,
  [ItemType.Playlist]: mapIdName,

  // TODO: All of these item types are missing
  [ItemType.Disc]: (a: ItemData) => a,

  [ItemType.HistoryPlaylist]: (a: ItemData) => a,
  [ItemType.DateAdded]: (a: ItemData) => a,
  [ItemType.MenuGenre]: (a: ItemData) => a,
  [ItemType.MenuArtist]: (a: ItemData) => a,
  [ItemType.MenuAlbum]: (a: ItemData) => a,
  [ItemType.MenuTrack]: (a: ItemData) => a,
  [ItemType.MenuPlaylist]: (a: ItemData) => a,
  [ItemType.MenuBPM]: (a: ItemData) => a,
  [ItemType.MenuRating]: (a: ItemData) => a,
  [ItemType.MenuYear]: (a: ItemData) => a,
  [ItemType.MenuRemixer]: (a: ItemData) => a,
  [ItemType.MenuLabel]: (a: ItemData) => a,
  [ItemType.MenuOriginal]: (a: ItemData) => a,
  [ItemType.MenuKey]: (a: ItemData) => a,
  [ItemType.MenuColor]: (a: ItemData) => a,
  [ItemType.MenuFolder]: (a: ItemData) => a,
  [ItemType.MenuSearch]: (a: ItemData) => a,
  [ItemType.MenuTime]: (a: ItemData) => a,
  [ItemType.MenuBit]: (a: ItemData) => a,
  [ItemType.MenuFilename]: (a: ItemData) => a,
  [ItemType.MenuHistory]: (a: ItemData) => a,
  [ItemType.MenuAll]: (a: ItemData) => a,
  [ItemType.TrackTitleAlbum]: (a: ItemData) => a,
  [ItemType.TrackTitleGenre]: (a: ItemData) => a,
  [ItemType.TrackTitleArtist]: (a: ItemData) => a,
  [ItemType.TrackTitleRating]: (a: ItemData) => a,
  [ItemType.TrackTitleTime]: (a: ItemData) => a,
  [ItemType.TrackTitleBPM]: (a: ItemData) => a,
  [ItemType.TrackTitleLabel]: (a: ItemData) => a,
  [ItemType.TrackTitleKey]: (a: ItemData) => a,
  [ItemType.TrackTitleBitRate]: (a: ItemData) => a,
  [ItemType.TrackTitleColor]: (a: ItemData) => a,
  [ItemType.TrackTitleComment]: (a: ItemData) => a,
  [ItemType.TrackTitleOriginalArtist]: (a: ItemData) => a,
  [ItemType.TrackTitleRemixer]: (a: ItemData) => a,
  [ItemType.TrackTitleDJPlayCount]: (a: ItemData) => a,
  [ItemType.MenuTrackTitleDateAdded]: (a: ItemData) => a,
};

/**
 * Represents a generic Item, specialized to a specific item by providing a
 * ItemType to the template.
 */
export type Item<T extends ItemType> = ReturnType<(typeof transformItem)[T]> & {type: T};

/**
 * Maps ItemTypes to Items
 */
export type Items = {
  [T in keyof typeof transformItem]: Item<T>;
};

/**
 * Translate a list of fields for an item response into a structure object,
 * making items more clear to work with.
 */
export const fieldsToItem = (args: Field[]) => {
  const itemData = makeItemData(args as ItemArgs);
  const {type} = itemData;

  let transformer = transformItem[type];

  // Typescript gives us safety, but it is possible there is an itemType we're
  // not aware of yet.
  if (transformer === undefined) {
    transformer = () => null;

    Sentry.captureMessage(
      `No item transformer registered for item type ${type}`,
      Sentry.Severity.Error
    );
  }

  return {...transformer(itemData), type} as Items[ItemType];
};
