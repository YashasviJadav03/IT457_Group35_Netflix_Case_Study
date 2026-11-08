-- ---------------------------------------------------------------------------
-- Schema and seed data for the watchlist application.
-- ---------------------------------------------------------------------------
-- The official postgres image runs every file in /docker-entrypoint-initdb.d/
-- the first time it starts with an empty data directory, and
-- docker-compose.yml mounts this file there. It is not re-run when the volume
-- already contains data, and it is not applied automatically to an external
-- server. To create the schema on a managed database such as Amazon RDS, run
-- it once by hand:
--   psql -h <host> -U <user> -d <database> -f init.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS watchlist (
    id         SERIAL PRIMARY KEY,
    user_name  VARCHAR(100) NOT NULL,
    title      VARCHAR(200) NOT NULL,
    genre      VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed a few rows so the page is not empty on a fresh install. The
-- "WHERE NOT EXISTS" guard makes a manual re-run harmless (no duplicates).
INSERT INTO watchlist (user_name, title, genre)
SELECT seed.user_name, seed.title, seed.genre
  FROM (
        VALUES ('Jiya',  'Stranger Things', 'Sci-Fi'),
               ('Jiya', 'Money Heist',     'Crime'),
               ('Jiya', 'The Crown',       'Drama'),
               ('DramaLlama',  'Black Mirror',    'Sci-Fi')
       ) AS seed (user_name, title, genre)
 WHERE NOT EXISTS (SELECT 1 FROM watchlist);
