-- V22: Add metadata fields for real job ingestion sources and real delivery tracking
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '';
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL';
ALTER TABLE job_openings ADD COLUMN IF NOT EXISTS apply_type text NOT NULL DEFAULT 'ATS_PORTAL';

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS delivery_channel text NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS delivery_receipt text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_job_openings_source ON job_openings (source);
CREATE INDEX IF NOT EXISTS idx_job_openings_apply_type ON job_openings (apply_type);
