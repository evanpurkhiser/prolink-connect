import type {BeatGrid, WaveformHD} from 'src/types';
import type {
  Track as OneLibraryTrack,
  CueAndLoop,
} from 'onelibrary-connect';

/**
 * Re-export entity types from onelibrary-connect.
 * These types represent what is stored in the rekordbox database.
 */
export {EntityFK} from 'onelibrary-connect';
export type {
  Album,
  Artist,
  Artwork,
  Color,
  Genre,
  Key,
  Label,
  Playlist,
  PlaylistEntry,
} from 'onelibrary-connect';

/**
 * Represents a track with both database fields and ANLZ analysis data.
 *
 * Extends the onelibrary-connect Track type with ANLZ-specific fields
 * that are populated from .DAT/.EXT analysis files on the CDJ.
 */
export type Track<withFKs extends import('onelibrary-connect').EntityFK = import('onelibrary-connect').EntityFK.WithRelations> =
  OneLibraryTrack<withFKs> & {
    /**
     * Embedded beat grid information (from ANLZ files)
     */
    beatGrid: BeatGrid | null;

    /**
     * Embedded HD Waveform information (from ANLZ files)
     */
    waveformHd: WaveformHD | null;
  };
