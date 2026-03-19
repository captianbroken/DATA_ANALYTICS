-- Add user_id to cameras and employees to allow direct assignment to users.
-- This allows a user to "own" specific cameras or employees even if they are at a different site,
-- or to restrict access within a site to specific personnel.

ALTER TABLE public.cameras
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL;

-- Index for performance when filtering by user
CREATE INDEX IF NOT EXISTS idx_cameras_user_id ON public.cameras(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);

-- Optional: If the user wants to see which users belong to a site directly in the sites table,
-- we've already seen that sites table is linked via users.site_id.

COMMENT ON COLUMN public.cameras.user_id IS 'Directly assigns this camera to a specific user for private access/monitoring.';
COMMENT ON COLUMN public.employees.user_id IS 'Directly assigns this employee to a specific user (e.g., manager/supervisor).';
