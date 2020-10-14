import {Table} from './orm';

export const generateSchema = () => `
  CREATE TABLE '${Table.Artist}' (
    'id' integer not null primary key,
    'name' varchar not null
  );
  CREATE TABLE '${Table.Album}' (
    'id' integer not null primary key,
    'name' varchar not null
  );
  CREATE TABLE '${Table.Genre}' (
    'id' integer not null primary key,
    'name' varchar not null
  );
  CREATE TABLE '${Table.Color}' (
    'id' integer not null primary key,
    'name' varchar not null
  );
  CREATE TABLE '${Table.Label}' (
    'id' integer not null primary key,
    'name' varchar not null
  );
  CREATE TABLE '${Table.Key}' (
    'id' integer not null primary key,
    'name' varchar not null
  );
  CREATE TABLE '${Table.Artwork}' (
    'id' integer not null primary key,
    'path' varchar not null
  );
  CREATE TABLE '${Table.Track}' (
    'id' integer not null primary key,
    'title' varchar not null,
    'duration' integer not null,
    'bitrate' integer not null,
    'tempo' integer not null,
    'rating' integer not null,
    'comment' varchar not null,
    'file_path' varchar not null,
    'file_name' varchar not null,
    'track_number' integer not null,
    'disc_number' integer not null,
    'sample_rate' integer not null,
    'sample_depth' integer not null,
    'play_count' integer not null,
    'year' integer not null,
    'mix_name' varchar not null,
    'autoload_hotcues' integer not null,
    'kuvo_public' integer not null,
    'file_size' integer not null,
    'analyze_path' varchar not null,
    'release_date' varchar not null,
    'analyze_date' datetime not null,
    'date_added' datetime not null,
    'beat_grid' text null,
    'cue_and_loops' text null,
    'waveform_hd' text null,
    'artwork_id' integer null,
    'artist_id' integer null,
    'original_artist_id' integer null,
    'remixer_id' integer null,
    'composer_id' integer null,
    'album_id' integer null,
    'label_id' integer null,
    'genre_id' integer null,
    'color_id' integer null,
    'key_id' integer null
  );
  CREATE TABLE '${Table.Playlist}' (
    'id' integer not null primary key,
    'is_folder' integer not null,
    'name' varchar not null,
    'parent_id' integer null
  );
  CREATE TABLE '${Table.PlaylistEntry}' (
    'id' integer not null primary key,
    'sort_index' integer not null,
    'playlist_id' integer null,
    'track_id' integer null
  );
  CREATE INDEX 'track_artwork_id_index'           on '${Table.Track}' ('artwork_id');
  CREATE INDEX 'track_artist_id_index'            on '${Table.Track}' ('artist_id');
  CREATE INDEX 'track_original_artist_id_index'   on '${Table.Track}' ('original_artist_id');
  CREATE INDEX 'track_remixer_id_index'           on '${Table.Track}' ('remixer_id');
  CREATE INDEX 'track_composer_id_index'          on '${Table.Track}' ('composer_id');
  CREATE INDEX 'track_album_id_index'             on '${Table.Track}' ('album_id');
  CREATE INDEX 'track_label_id_index'             on '${Table.Track}' ('label_id');
  CREATE INDEX 'track_genre_id_index'             on '${Table.Track}' ('genre_id');
  CREATE INDEX 'track_color_id_index'             on '${Table.Track}' ('color_id');
  CREATE INDEX 'track_key_id_index'               on '${Table.Track}' ('key_id');
  CREATE INDEX 'playlist_parent_id_index'         on '${Table.Playlist}' ('parent_id');
  CREATE INDEX 'playlist_entry_playlist_id_index' on '${Table.PlaylistEntry}' ('playlist_id');
  CREATE INDEX 'playlist_entry_track_id_index'    on '${Table.PlaylistEntry}' ('track_id');
`;
