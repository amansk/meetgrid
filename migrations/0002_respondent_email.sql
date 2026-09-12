-- Respondents now identify themselves with a first name and an email address.
-- Nullable on purpose: rows created before this migration have no address, and
-- those responses must keep working on polls that are already out there.
ALTER TABLE respondents ADD COLUMN email TEXT;

-- The duplicate check looks up one poll's respondents by address.
CREATE INDEX idx_respondents_poll_email ON respondents(poll_id, email);
