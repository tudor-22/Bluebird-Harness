-- Databases made by early versions used other names for the sign-in function and role. Carry them over.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'arya_upsert_user') THEN
    ALTER FUNCTION arya_upsert_user(text, text, text, text) RENAME TO bluebird_upsert_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arya_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bluebird_app') THEN
    ALTER ROLE arya_app RENAME TO bluebird_app;
  END IF;
END
$$;
