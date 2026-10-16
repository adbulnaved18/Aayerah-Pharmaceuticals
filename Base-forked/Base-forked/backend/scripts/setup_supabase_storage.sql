-- ==============================================================================
-- Supabase Storage Setup for Aayerah Pharmaceuticals
-- ==============================================================================
-- Run this script in the Supabase Dashboard SQL Editor (or via Supabase CLI).
--
-- Buckets:
-- 1. 'product-images':
--    - Public: true (allows direct browser read via CDN/public URL)
--    - RLS: Only SELECT is permitted for public/anon.
--    - Upload/Update/Delete: NO public policy (only service_role key can write).
--
-- 2. 'private-documents':
--    - Public: false (strictly private)
--    - RLS: No public policies at all.
--    - All access (read, write, delete) is authenticated & proxied by the FastAPI backend
--      using the service_role key.
-- ==============================================================================

-- 1. Create or update buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'product-images',
    'product-images',
    true,
    5242880, -- 5 MB
    ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
  )
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'private-documents',
    'private-documents',
    false,
    15728640, -- 15 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']
  )
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Enable Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Public Read Policy for product-images
-- Drop existing policy if present to make script idempotent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Public read for product-images'
  ) THEN
    DROP POLICY "Public read for product-images" ON storage.objects;
  END IF;
END $$;

CREATE POLICY "Public read for product-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Note:
-- The backend uses SUPABASE_SERVICE_ROLE_KEY to perform all administrative operations
-- (uploads, updates, deletes, and reading private documents).
-- The service_role key automatically bypasses Row Level Security in Supabase.
-- DO NOT create any INSERT/UPDATE/DELETE policies for public or authenticated roles.
