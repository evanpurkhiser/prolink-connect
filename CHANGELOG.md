# Changelog

## UNRELEASED

* Introduced a method to play and cue CDJs.

* Device manager has learned `getDeviceEnsured`, which will wait until the
  device appears on the network before resolving. Useful for when you know a
  device should be on the netowrk, but maybe has not yet announced itself

* Use `getDeviceEnsured` when querying the aggregate database. This will help
  with situations where a device reports having a track loaded from a device
  which has not yet announced itself on the network.

* Upgraded to mikro-orm v7, removing some frustrating dependencies that would
  be deeply bundled into apps using prolink-connect.

  **NOTE** This may require some fiddling if you were bundling this library
  using webpack, since tye old mikro-orm required special configuration, as
  does the new mikro-orm.

  It's likely I'll remove the mikro-orm dependency in the future.

* A new `prolink-connect/lib/types` file is available, which only exports types
  and enums, and does NOT rquire any runtime dependencies. This may be useful
  when you want to use prolink-connect types in a frontend application, and do
  not want to accidentally bundle various node.js dependencies into your app.

  This specifically will fix an issue where `@sentry/node` was being bundled
  into frontend apps.

## v0.1.0

* Fixed a bug in mixstatus when ending a track by taking the deck off-air and
  then cueing before it finished determining if the off-air action passed the
  number of interupt beats, causing the track to incorrectly NOT be cleared
  from having been marked as having reported itself as playing.

## v0.1.0-prerelease.0

* Initial working implementation. This is currently being used to re-implement
  [prolink-tools](https://github.com/evanpurkhiser/prolink-tools).
