-- Live cursors for remote peers and deterministic, orderable snapshot keys.
ALTER TABLE presence ADD COLUMN page_id TEXT;
ALTER TABLE presence ADD COLUMN cursor_x INTEGER;
ALTER TABLE presence ADD COLUMN cursor_y INTEGER;
