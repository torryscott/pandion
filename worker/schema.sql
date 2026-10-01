-- Pandion Plots usage counters: the whole of what is stored.
-- One row per UTC day and kind, holding a count. No IP, no user agent,
-- no timestamp finer than the day, no identifier of any kind.
CREATE TABLE IF NOT EXISTS hits (
  day  TEXT NOT NULL,              -- YYYY-MM-DD, UTC
  kind TEXT NOT NULL,              -- 'launch' | 'launch-day' | 'portable'
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);

-- GitHub download history (Oct 2026). The Worker creates these itself on
-- its first hourly check (snapshotDownloads in worker/index.js); they are
-- listed here so a fresh database can be set up in one step. They hold
-- GitHub's public download counts, nothing about any visitor.
CREATE TABLE IF NOT EXISTS downloads (
  day   TEXT NOT NULL,             -- YYYY-MM-DD, UTC: the day the increase was seen
  asset TEXT NOT NULL,             -- the file's name on GitHub Releases
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, asset)
);
CREATE TABLE IF NOT EXISTS download_totals (
  release TEXT NOT NULL,           -- release tag
  asset   TEXT NOT NULL,
  total   INTEGER NOT NULL,        -- the running total GitHub reported last
  PRIMARY KEY (release, asset)
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,          -- downloads_since, downloads_checked, downloads_etag
  value TEXT NOT NULL
);
