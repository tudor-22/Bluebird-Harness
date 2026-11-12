-- PDFs (and future documents) join images and audio as attachments.
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check
  CHECK (kind IN ('image', 'audio', 'document'));
