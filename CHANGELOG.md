# Changelog

## UNRELEASED

* Introduced a method to play and cue CDJs.

## v0.1.0

* Fixed a bug in mixstatus when ending a track by taking the deck off-air and
  then cueing before it finished determining if the off-air action passed the
  number of interupt beats, causing the track to incorrectly NOT be cleared
  from having been marked as having reported itself as playing.

## v0.1.0-prerelease.0

* Initial working implementation. This is currently being used to re-implement
  [prolink-tools](https://github.com/evanpurkhiser/prolink-tools).
