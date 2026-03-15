-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing RLS policies on users table to recreate them
DROP POLICY IF EXISTS "Users can view their own record" ON public.users;
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to read users" ON public.users;
DROP POLICY IF EXISTS "Allow admin to read all users" ON public.users;
DROP POLICY IF EXISTS "Allow admin to update users" ON public.users;

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create a helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.roles r ON u.role_id = r.id
    WHERE u.auth_user_id = user_id
    AND r.role_name = 'admin'
    AND u.is_deleted = FALSE
    AND u.status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies for users table
-- Allow users to read their own data
CREATE POLICY "Users can view their own record"
ON public.users
FOR SELECT
USING (auth.uid() = auth_user_id OR public.is_admin(auth.uid()));

-- Allow users to update their own data
CREATE POLICY "Users can update their own record"
ON public.users
FOR UPDATE
USING (auth.uid() = auth_user_id OR public.is_admin(auth.uid()))
WITH CHECK (auth.uid() = auth_user_id OR public.is_admin(auth.uid()));

-- Enable RLS on other tables as needed
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_servers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read roles
CREATE POLICY "Allow authenticated users to read roles"
ON public.roles
FOR SELECT
TO authenticated
USING (TRUE);

-- Allow authenticated users to read sites
CREATE POLICY "Allow authenticated users to read sites"
ON public.sites
FOR SELECT
TO authenticated
USING (TRUE);

-- Allow authenticated users to read edge servers
CREATE POLICY "Allow authenticated users to read edge_servers"
ON public.edge_servers
FOR SELECT
TO authenticated
USING (TRUE);

-- Ensure admin user exists and is properly configured
SELECT public.seed_admin_user('Admin User', 'admin@hyperspark.io', 'Admin@12345');
