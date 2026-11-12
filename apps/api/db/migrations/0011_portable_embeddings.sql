-- Embeddings are plain real[] arrays, so the database needs no extension and runs the same on every
-- platform. Databases made by older versions stored them with pgvector: convert them in place.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['memory_embeddings', 'message_embeddings'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = to_regclass(tbl) AND a.attname = 'embedding' AND format_type(a.atttypid, a.atttypmod) LIKE 'vector%'
    ) THEN
      EXECUTE format('DROP INDEX IF EXISTS %I', replace(tbl, '_embeddings', '') || '_embeddings_hnsw_idx');
      EXECUTE format('ALTER TABLE %I ALTER COLUMN embedding TYPE real[] USING embedding::real[]', tbl);
    END IF;
  END LOOP;
END $$;

-- Cosine similarity between two embeddings, 1 for the same direction.
CREATE OR REPLACE FUNCTION bb_cosine(a real[], b real[]) RETURNS double precision
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE WHEN n = 0 THEN 0 ELSE d / n END
  FROM (SELECT sum(x * y)::float8 AS d, sqrt(sum(x * x) * sum(y * y))::float8 AS n FROM unnest(a, b) AS t(x, y)) s
$$;
