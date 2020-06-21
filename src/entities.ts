import {
  Entity,
  PrimaryKey,
  OneToMany,
  ManyToOne,
  Property,
  Collection,
  QueryOrder,
} from 'mikro-orm';

import {BeatGrid, CueAndLoop, WaveformHD} from 'src/types';

@Entity()
export class Artwork {
  @PrimaryKey() id!: number;
  @Property() path?: string;
  @OneToMany(() => Track, track => track.artwork)
  tracks = new Collection<Track>(this);
}

@Entity()
export class Key {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @OneToMany(() => Track, track => track.key)
  tracks = new Collection<Track>(this);
}

@Entity()
export class Label {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @OneToMany(() => Track, track => track.label)
  tracks = new Collection<Track>(this);
}

@Entity()
export class Color {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @OneToMany(() => Track, track => track.color)
  tracks = new Collection<Track>(this);
}

@Entity()
export class Genre {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @OneToMany(() => Track, track => track.genre)
  tracks = new Collection<Track>(this);
}

@Entity()
export class Album {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @OneToMany(() => Track, track => track.album)
  tracks = new Collection<Track>(this);
}

@Entity()
export class Artist {
  @PrimaryKey() id!: number;
  @Property() name!: string;
  @OneToMany(() => Track, track => track.artist)
  tracks = new Collection<Track>(this);
}

@Entity()
export class Playlist {
  @PrimaryKey() id!: number;
  @Property() isFolder!: boolean;
  @Property() name!: string;

  @ManyToOne(() => Playlist)
  parent!: Playlist | null;

  @OneToMany(() => Playlist, playlist => playlist.parent)
  children: Collection<Playlist> = new Collection(this);

  @OneToMany(() => PlaylistEntry, entry => entry.playlist, {
    orderBy: {sortIndex: QueryOrder.DESC},
  })
  entries = new Collection<PlaylistEntry>(this);
}

/**
 * Represents a track.
 *
 * Note, fields that are not optional will be set for all database request
 * methods.
 */
@Entity()
export class Track {
  @PrimaryKey() id!: number;
  @Property() title!: string;
  @Property() duration!: number;
  @Property() bitrate?: number;
  @Property() tempo!: number;
  @Property() rating!: number;
  @Property() comment!: string;
  @Property() filePath!: string;
  @Property() fileName!: string;
  @Property() trackNumber?: number;
  @Property() discNumber?: number;
  @Property() sampleRate?: number;
  @Property() sampleDepth?: number;
  @Property() playCount?: number;
  @Property() year?: number;
  @Property() mixName?: string;
  @Property() autoloadHotcues?: boolean;
  @Property() kuvoPublic?: boolean;
  @Property() fileSize?: number;
  @Property() analyzePath?: string;
  @Property() releaseDate?: string;
  @Property() analyzeDate?: Date;
  @Property() dateAdded?: Date;

  /**
   * Embedded beat grid information
   */
  @Property({nullable: true})
  beatGrid!: BeatGrid | null;

  /**
   * Embedded cue and loop information
   */
  @Property({nullable: true})
  cueAndLoops!: CueAndLoop[] | null;

  /**
   * Embedded HD Waveform information
   */
  @Property({nullable: true})
  waveformHd!: WaveformHD | null;

  @ManyToOne(() => Artwork, {eager: true}) artwork!: Artwork | null;
  @ManyToOne(() => Artist, {eager: true}) artist!: Artist | null;
  @ManyToOne(() => Artist, {eager: true}) originalArtist!: Artist | null;
  @ManyToOne(() => Artist, {eager: true}) remixer!: Artist | null;
  @ManyToOne(() => Artist, {eager: true}) composer!: Artist | null;
  @ManyToOne(() => Album, {eager: true}) album!: Album | null;
  @ManyToOne(() => Label, {eager: true}) label!: Label | null;
  @ManyToOne(() => Genre, {eager: true}) genre!: Genre | null;
  @ManyToOne(() => Color, {eager: true}) color!: Color | null;
  @ManyToOne(() => Key, {eager: true}) key!: Key | null;
}

@Entity()
export class PlaylistEntry {
  @PrimaryKey() id!: number;
  @Property() sortIndex!: number;

  @ManyToOne(() => Playlist)
  playlist!: Playlist;

  @ManyToOne(() => Track)
  track!: Track;
}
