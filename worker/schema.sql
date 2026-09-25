-- Pandion Plots usage counters: the whole of what is stored.
-- One row per UTC day and kind, holding a count. No IP, no user agent,
-- no timestamp finer than the day, no identifier of any kind.
CREATE TABLE IF NOT EXISTS hits (
  day  TEXT NOT NULL,              -- YYYY-MM-DD, UTC
  kind TEXT NOT NULL,              -- 'launch' | 'launch-day' | 'portable'
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
);
