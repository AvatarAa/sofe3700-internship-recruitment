-- Phase III external job search history and result snapshots. Safe to run more than once.
CREATE TABLE IF NOT EXISTS external_job_search (
    search_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER REFERENCES app_user(user_id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    keyword VARCHAR(120) NOT NULL,
    location VARCHAR(120) NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    searched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS external_job_result (
    result_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    search_id BIGINT NOT NULL REFERENCES external_job_search(search_id) ON DELETE CASCADE,
    source_job_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    location VARCHAR(255),
    description TEXT,
    salary_min NUMERIC(12, 2),
    salary_max NUMERIC(12, 2),
    redirect_url TEXT NOT NULL,
    category VARCHAR(120),
    published_at TIMESTAMPTZ,
    source_payload JSONB NOT NULL,
    UNIQUE (search_id, source_job_id)
);

ALTER TABLE external_job_search ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_external_job_search_recent
    ON external_job_search (searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_job_result_search
    ON external_job_result (search_id);
