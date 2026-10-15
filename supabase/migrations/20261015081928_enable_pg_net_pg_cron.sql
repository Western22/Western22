-- Extensions for scheduled jobs: pg_cron runs schedules, pg_net makes HTTP calls
-- (used to call /api/cron/* from the database). Applied to production first.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
