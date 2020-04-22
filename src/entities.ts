import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {BeatGrid, CueAndLoop} from './types';

@Entity()
export class Artwork {
  @PrimaryColumn() id: number;
  @OneToMany(() => Track, track => track.artwork) tracks: Track[];
  @Column() path: string;
}

@Entity()
export class Key {
  @PrimaryColumn() id: number;
  @OneToMany(() => Track, track => track.key) tracks: Track[];
  @Column() name: string;
}

@Entity()
export class Label {
  @PrimaryColumn() id: number;
  @OneToMany(() => Track, track => track.label) tracks: Track[];
  @Column() name: string;
}

@Entity()
export class Color {
  @PrimaryColumn() id: number;
  @OneToMany(() => Track, track => track.color) tracks: Track[];
  @Column() name: string;
}

@Entity()
export class Genre {
  @PrimaryColumn() id: number;
  @OneToMany(() => Track, track => track.genre) tracks: Track[];
  @Column() name: string;
}

@Entity()
export class Album {
  @PrimaryColumn() id: number;
  @OneToMany(() => Track, track => track.album) tracks: Track[];
  @Column() name: string;
}

@Entity()
export class Artist {
  @PrimaryColumn() id: number;
  @OneToMany(() => Track, track => track.artist) tracks: Track[];
  @Column() name: string;
}

@Entity()
export class Playlist {
  @PrimaryColumn() id: number;
  @Column() isFolder: boolean;
  @Column() name: string;

  @ManyToOne(() => Playlist, playlist => playlist.children)
  parent: Playlist | null;

  @OneToMany(() => Playlist, playlist => playlist.parent)
  children: Playlist[];

  @OneToMany(() => PlaylistEntry, entry => entry.playlist)
  entries: PlaylistEntry[];
}

@Entity()
export class Track {
  @PrimaryColumn() id: number;
  @Column() title: string;
  @Column() trackNumber: number;
  @Column() discNumber: number;
  @Column() duration: number;
  @Column() sampleRate: number;
  @Column() sampleDepth: number;
  @Column() bitrate: number;
  @Column() tempo: number;
  @Column() playCount: number;
  @Column() year: number;
  @Column() rating: number;
  @Column() mixName: string;
  @Column() comment: string;
  @Column() autoloadHotcues: boolean;
  @Column() kuvoPublic: boolean;
  @Column() filePath: string;
  @Column() fileName: string;
  @Column() fileSize: number;
  @Column() analyzePath: string;
  @Column() releaseDate: string;
  @Column('date') analyzeDate: Date;
  @Column('date') dateAdded: Date;

  /**
   * Embedded beat grid information
   */
  @Column({type: 'simple-json', nullable: true})
  beatGrid: BeatGrid | null;

  /**
   * Embedded cue and loop information
   */
  @Column({type: 'simple-json', nullable: true})
  cueAndLoops: CueAndLoop[] | null;

  @ManyToOne(() => Artwork, {eager: true}) artwork: Artwork | null;
  @ManyToOne(() => Artist, {eager: true}) artist: Artist | null;
  @ManyToOne(() => Artist, {eager: true}) originalArtist: Artist | null;
  @ManyToOne(() => Artist, {eager: true}) remixer: Artist | null;
  @ManyToOne(() => Artist, {eager: true}) composer: Artist | null;
  @ManyToOne(() => Album, {eager: true}) album: Album | null;
  @ManyToOne(() => Label, {eager: true}) label: Label | null;
  @ManyToOne(() => Genre, {eager: true}) genre: Genre | null;
  @ManyToOne(() => Color, {eager: true}) color: Color | null;
  @ManyToOne(() => Key, {eager: true}) key: Key | null;
}

@Entity({orderBy: {sortIndex: 'DESC'}})
export class PlaylistEntry {
  @PrimaryGeneratedColumn() id: number;
  @Column() sortIndex: number;

  @ManyToOne(() => Playlist, playlist => playlist)
  playlist: Playlist;

  @ManyToOne(() => Track)
  track: Track;
}
