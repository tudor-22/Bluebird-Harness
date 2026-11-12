-- The durable copy of attachment bytes lives in Postgres, so nightly database
-- backups always carry the images, audio and documents people sent.
ALTER TABLE attachments ADD COLUMN content bytea;
