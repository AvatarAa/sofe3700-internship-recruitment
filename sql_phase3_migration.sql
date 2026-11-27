-- Phase III external API cache. Safe to run more than once.
CREATE TABLE IF NOT EXISTS weather_observation (
    weather_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requested_location VARCHAR(120) NOT NULL,
    resolved_location VARCHAR(255) NOT NULL,
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    observed_at TIMESTAMP NOT NULL,
    temperature_c NUMERIC(6, 2),
    apparent_temperature_c NUMERIC(6, 2),
    humidity_percent INTEGER,
    precipitation_mm NUMERIC(8, 2),
    wind_speed_kmh NUMERIC(7, 2),
    weather_code INTEGER,
    source_payload JSONB NOT NULL,
    fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_weather_observation_location_fetched
    ON weather_observation (requested_location, fetched_at DESC);
