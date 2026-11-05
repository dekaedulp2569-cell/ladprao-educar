-- Migration: add related_line_user_ids column to car_requests
-- Stores an array of LINE User IDs (JSONB) for people related to the request
-- Default value is an empty JSON array [] to avoid NULL handling

ALTER TABLE public.car_requests
  ADD COLUMN IF NOT EXISTS related_line_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
