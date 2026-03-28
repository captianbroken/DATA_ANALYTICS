-- Incremental alignment for the React dashboard and Supabase Auth.
-- Safe to run multiple times.

INSERT INTO public.roles (role_name, description)
VALUES
    ('admin', 'Full access to the system'),
    ('user', 'Limited standard user access')
ON CONFLICT (role_name) DO NOTHING;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS auth_user_id UUID,
    ADD COLUMN IF NOT EXISTS site_id INTEGER,
    ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

ALTER TABLE public.users
    ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE public.users
    ALTER COLUMN password_hash SET DEFAULT 'supabase_auth_managed';

UPDATE public.users
SET password_hash = COALESCE(password_hash, 'supabase_auth_managed');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_auth_user_id_fkey'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_auth_user_id_fkey
            FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_site_id_fkey'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_site_id_fkey
            FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_auth_user_id_key'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);
    END IF;
END $$;

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS designation VARCHAR(100),
    ADD COLUMN IF NOT EXISTS site_id INTEGER,
    ADD COLUMN IF NOT EXISTS face_registered BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS face_image_paths JSONB,
    ADD COLUMN IF NOT EXISTS has_spectacles BOOLEAN DEFAULT FALSE;

UPDATE public.employees
SET
    face_registered = COALESCE(face_registered, FALSE),
    has_spectacles = COALESCE(has_spectacles, FALSE);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'employees_site_id_fkey'
          AND conrelid = 'public.employees'::regclass
    ) THEN
        ALTER TABLE public.employees
            ADD CONSTRAINT employees_site_id_fkey
            FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE public.cameras
    ADD COLUMN IF NOT EXISTS ai_model VARCHAR(50) DEFAULT 'FRS+PPE';

UPDATE public.cameras
SET ai_model = COALESCE(ai_model, 'FRS+PPE');

CREATE OR REPLACE FUNCTION public.create_dashboard_user(
    p_name TEXT,
    p_email TEXT,
    p_password TEXT,
    p_role_name TEXT DEFAULT 'user',
    p_status TEXT DEFAULT 'active',
    p_site_id INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_instance_id UUID := '00000000-0000-0000-0000-000000000000'::uuid;
    v_email TEXT := lower(trim(p_email));
    v_name TEXT := trim(p_name);
    v_role_name TEXT := COALESCE(NULLIF(lower(trim(p_role_name)), ''), 'user');
    v_status TEXT := COALESCE(NULLIF(lower(trim(p_status)), ''), 'active');
    v_role_id INTEGER;
    v_auth_user_id UUID;
    v_public_user_id INTEGER;
BEGIN
    IF COALESCE(v_name, '') = '' THEN
        RAISE EXCEPTION 'Name is required';
    END IF;

    IF COALESCE(v_email, '') = '' THEN
        RAISE EXCEPTION 'Email is required';
    END IF;

    IF COALESCE(trim(p_password), '') = '' THEN
        RAISE EXCEPTION 'Password is required';
    END IF;

    SELECT id INTO v_role_id
    FROM public.roles
    WHERE role_name = v_role_name;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Role "%" was not found', v_role_name;
    END IF;

    SELECT id
    INTO v_auth_user_id
    FROM auth.users
    WHERE lower(email) = v_email
    LIMIT 1;

    IF v_auth_user_id IS NULL THEN
        v_auth_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            banned_until,
            is_super_admin,
            is_sso_user,
            is_anonymous
        )
        VALUES (
            v_instance_id,
            v_auth_user_id,
            'authenticated',
            'authenticated',
            v_email,
            crypt(trim(p_password), gen_salt('bf')),
            NOW(),
            jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
            jsonb_build_object('name', v_name),
            NOW(),
            NOW(),
            CASE WHEN v_status = 'inactive' THEN NOW() + INTERVAL '100 years' ELSE NULL END,
            FALSE,
            FALSE,
            FALSE
        );

        INSERT INTO auth.identities (
            id,
            provider_id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            v_email,
            v_auth_user_id,
            jsonb_build_object(
                'sub', v_auth_user_id::text,
                'email', v_email,
                'email_verified', true,
                'phone_verified', false
            ),
            'email',
            NOW(),
            NOW(),
            NOW()
        );
    ELSE
        UPDATE auth.users
        SET
            email = v_email,
            encrypted_password = crypt(trim(p_password), gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
            raw_user_meta_data = jsonb_build_object('name', v_name),
            banned_until = CASE WHEN v_status = 'inactive' THEN NOW() + INTERVAL '100 years' ELSE NULL END,
            deleted_at = NULL,
            updated_at = NOW()
        WHERE id = v_auth_user_id;

        UPDATE auth.identities
        SET
            provider_id = v_email,
            identity_data = jsonb_build_object(
                'sub', v_auth_user_id::text,
                'email', v_email,
                'email_verified', true,
                'phone_verified', false
            ),
            updated_at = NOW()
        WHERE user_id = v_auth_user_id
          AND provider = 'email';

        IF NOT FOUND THEN
            INSERT INTO auth.identities (
                id,
                provider_id,
                user_id,
                identity_data,
                provider,
                last_sign_in_at,
                created_at,
                updated_at
            )
            VALUES (
                gen_random_uuid(),
                v_email,
                v_auth_user_id,
                jsonb_build_object(
                    'sub', v_auth_user_id::text,
                    'email', v_email,
                    'email_verified', true,
                    'phone_verified', false
                ),
                'email',
                NOW(),
                NOW(),
                NOW()
            );
        END IF;
    END IF;

    INSERT INTO public.users (
        auth_user_id,
        name,
        email,
        password_hash,
        role_id,
        site_id,
        status,
        is_deleted
    )
    VALUES (
        v_auth_user_id,
        v_name,
        v_email,
        crypt(trim(p_password), gen_salt('bf')),
        v_role_id,
        p_site_id,
        v_status,
        FALSE
    )
    ON CONFLICT (email) DO UPDATE
    SET
        auth_user_id = EXCLUDED.auth_user_id,
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role_id = EXCLUDED.role_id,
        site_id = EXCLUDED.site_id,
        status = EXCLUDED.status,
        is_deleted = FALSE;

    SELECT id
    INTO v_public_user_id
    FROM public.users
    WHERE email = v_email;

    RETURN v_public_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_dashboard_user(
    p_user_id INTEGER,
    p_name TEXT,
    p_email TEXT,
    p_password TEXT DEFAULT NULL,
    p_role_name TEXT DEFAULT 'user',
    p_status TEXT DEFAULT 'active',
    p_site_id INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_instance_id UUID := '00000000-0000-0000-0000-000000000000'::uuid;
    v_email TEXT := lower(trim(p_email));
    v_name TEXT := trim(p_name);
    v_role_name TEXT := COALESCE(NULLIF(lower(trim(p_role_name)), ''), 'user');
    v_status TEXT := COALESCE(NULLIF(lower(trim(p_status)), ''), 'active');
    v_role_id INTEGER;
    v_auth_user_id UUID;
BEGIN
    IF COALESCE(v_name, '') = '' THEN
        RAISE EXCEPTION 'Name is required';
    END IF;

    IF COALESCE(v_email, '') = '' THEN
        RAISE EXCEPTION 'Email is required';
    END IF;

    SELECT id INTO v_role_id
    FROM public.roles
    WHERE role_name = v_role_name;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Role "%" was not found', v_role_name;
    END IF;

    SELECT auth_user_id
    INTO v_auth_user_id
    FROM public.users
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User "%" was not found', p_user_id;
    END IF;

    IF v_auth_user_id IS NULL THEN
        SELECT id
        INTO v_auth_user_id
        FROM auth.users
        WHERE lower(email) = v_email
        LIMIT 1;
    END IF;

    IF v_auth_user_id IS NULL THEN
        v_auth_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            banned_until,
            is_super_admin,
            is_sso_user,
            is_anonymous
        )
        VALUES (
            v_instance_id,
            v_auth_user_id,
            'authenticated',
            'authenticated',
            v_email,
            crypt(COALESCE(NULLIF(trim(p_password), ''), 'ChangeMe@123'), gen_salt('bf')),
            NOW(),
            jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
            jsonb_build_object('name', v_name),
            NOW(),
            NOW(),
            CASE WHEN v_status = 'inactive' THEN NOW() + INTERVAL '100 years' ELSE NULL END,
            FALSE,
            FALSE,
            FALSE
        );
    ELSE
        UPDATE auth.users
        SET
            email = v_email,
            raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
            raw_user_meta_data = jsonb_build_object('name', v_name),
            banned_until = CASE WHEN v_status = 'inactive' THEN NOW() + INTERVAL '100 years' ELSE NULL END,
            deleted_at = NULL,
            updated_at = NOW(),
            encrypted_password = CASE
                WHEN COALESCE(NULLIF(trim(p_password), ''), '') = '' THEN encrypted_password
                ELSE crypt(trim(p_password), gen_salt('bf'))
            END
        WHERE id = v_auth_user_id;
    END IF;

    UPDATE auth.identities
    SET
        provider_id = v_email,
        identity_data = jsonb_build_object(
            'sub', v_auth_user_id::text,
            'email', v_email,
            'email_verified', true,
            'phone_verified', false
        ),
        updated_at = NOW()
    WHERE user_id = v_auth_user_id
      AND provider = 'email';

    IF NOT FOUND THEN
        INSERT INTO auth.identities (
            id,
            provider_id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        )
        VALUES (
            gen_random_uuid(),
            v_email,
            v_auth_user_id,
            jsonb_build_object(
                'sub', v_auth_user_id::text,
                'email', v_email,
                'email_verified', true,
                'phone_verified', false
            ),
            'email',
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    UPDATE public.users
    SET
        auth_user_id = v_auth_user_id,
        name = v_name,
        email = v_email,
        password_hash = CASE
            WHEN COALESCE(NULLIF(trim(p_password), ''), '') = '' THEN password_hash
            ELSE crypt(trim(p_password), gen_salt('bf'))
        END,
        role_id = v_role_id,
        site_id = p_site_id,
        status = v_status,
        is_deleted = FALSE
    WHERE id = p_user_id;

    RETURN p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_dashboard_user(p_user_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_auth_user_id UUID;
BEGIN
    SELECT auth_user_id
    INTO v_auth_user_id
    FROM public.users
    WHERE id = p_user_id;

    UPDATE public.users
    SET
        is_deleted = TRUE,
        status = 'inactive'
    WHERE id = p_user_id;

    IF v_auth_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET
            banned_until = NOW() + INTERVAL '100 years',
            updated_at = NOW()
        WHERE id = v_auth_user_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_login(
    p_email TEXT,
    p_password TEXT
)
RETURNS TABLE (
    id INTEGER,
    email TEXT,
    name TEXT,
    role TEXT,
    site_id INTEGER,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email::TEXT,
        u.name::TEXT,
        r.role_name::TEXT,
        u.site_id,
        u.status::TEXT
    FROM public.users u
    LEFT JOIN public.roles r ON r.id = u.role_id
    WHERE lower(u.email) = lower(trim(p_email))
      AND u.is_deleted = FALSE
      AND u.status = 'active'
      AND COALESCE(u.password_hash, '') <> ''
      AND u.password_hash <> 'supabase_auth_managed'
      AND u.password_hash = crypt(trim(p_password), u.password_hash)
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_dashboard_password(
    p_user_id INTEGER,
    p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_auth_user_id UUID;
BEGIN
    IF COALESCE(trim(p_password), '') = '' THEN
        RAISE EXCEPTION 'Password is required';
    END IF;

    UPDATE public.users
    SET password_hash = crypt(trim(p_password), gen_salt('bf'))
    WHERE id = p_user_id
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User "%" was not found', p_user_id;
    END IF;

    SELECT auth_user_id
    INTO v_auth_user_id
    FROM public.users
    WHERE id = p_user_id;

    IF v_auth_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET
            encrypted_password = crypt(trim(p_password), gen_salt('bf')),
            updated_at = NOW()
        WHERE id = v_auth_user_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_admin_user(
    p_name TEXT DEFAULT 'Admin User',
    p_email TEXT DEFAULT 'admin@hyperspark.io',
    p_password TEXT DEFAULT 'Admin@12345'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_id INTEGER;
BEGIN
    SELECT public.create_dashboard_user(p_name, p_email, p_password, 'admin', 'active', NULL)
    INTO v_user_id;

    RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_dashboard_user(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_dashboard_user(INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_dashboard_user(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_dashboard_password(INTEGER, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_admin_user(TEXT, TEXT, TEXT) TO anon, authenticated;

SELECT public.seed_admin_user('Admin User', 'admin@hyperspark.io', 'Admin@12345');

CREATE OR REPLACE FUNCTION public.create_site(
    p_site_name TEXT,
    p_address TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'active'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_site_id INTEGER;
BEGIN
    IF COALESCE(trim(p_site_name), '') = '' THEN
        RAISE EXCEPTION 'Site name is required';
    END IF;

    INSERT INTO public.sites (site_name, address, description, status)
    VALUES (
        trim(p_site_name),
        NULLIF(trim(COALESCE(p_address, '')), ''),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        COALESCE(NULLIF(lower(trim(COALESCE(p_status, ''))), ''), 'active')
    )
    RETURNING id INTO v_site_id;

    RETURN v_site_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_site(
    p_site_id INTEGER,
    p_site_name TEXT,
    p_address TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'active'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    IF COALESCE(trim(p_site_name), '') = '' THEN
        RAISE EXCEPTION 'Site name is required';
    END IF;

    UPDATE public.sites
    SET
        site_name = trim(p_site_name),
        address = NULLIF(trim(COALESCE(p_address, '')), ''),
        description = NULLIF(trim(COALESCE(p_description, '')), ''),
        status = COALESCE(NULLIF(lower(trim(COALESCE(p_status, ''))), ''), 'active')
    WHERE id = p_site_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Site "%" was not found', p_site_id;
    END IF;

    RETURN p_site_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_site(
    p_site_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    DELETE FROM public.sites
    WHERE id = p_site_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Site "%" was not found', p_site_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_site(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_site(INTEGER, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_site(INTEGER) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_dashboard_users()
RETURNS TABLE (
    id INTEGER,
    auth_user_id UUID,
    name TEXT,
    email TEXT,
    status TEXT,
    is_deleted BOOLEAN,
    last_login TIMESTAMPTZ,
    role_id INTEGER,
    site_id INTEGER,
    role_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
    SELECT
        u.id,
        u.auth_user_id,
        u.name::TEXT,
        u.email::TEXT,
        u.status::TEXT,
        u.is_deleted,
        u.last_login,
        u.role_id,
        u.site_id,
        COALESCE(r.role_name, 'user')::TEXT AS role_name
    FROM public.users u
    LEFT JOIN public.roles r ON r.id = u.role_id
    ORDER BY u.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_dashboard_sites()
RETURNS TABLE (
    id INTEGER,
    site_name TEXT,
    address TEXT,
    description TEXT,
    status TEXT,
    created_at TIMESTAMP
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
    SELECT
        s.id,
        s.site_name::TEXT,
        COALESCE(s.address, '')::TEXT,
        COALESCE(s.description, '')::TEXT,
        COALESCE(s.status, 'active')::TEXT,
        s.created_at
    FROM public.sites s
    ORDER BY s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_dashboard_roles()
RETURNS TABLE (
    id INTEGER,
    role_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
    SELECT r.id, r.role_name::TEXT
    FROM public.roles r
    ORDER BY r.id;
$$;

GRANT EXECUTE ON FUNCTION public.list_dashboard_users() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_dashboard_sites() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_dashboard_roles() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_user_site(
    p_user_id INTEGER,
    p_site_id INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    UPDATE public.users
    SET site_id = p_site_id
    WHERE id = p_user_id
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User "%" was not found', p_user_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_user_site(INTEGER, INTEGER) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_dashboard_edge_servers(
    p_site_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    site_id INTEGER,
    server_name TEXT,
    ip_address TEXT,
    mac_address TEXT,
    status TEXT,
    is_deleted BOOLEAN,
    created_at TIMESTAMP,
    site_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
    SELECT
        es.id,
        es.site_id,
        es.server_name::TEXT,
        COALESCE(es.ip_address, '')::TEXT,
        COALESCE(es.mac_address, '')::TEXT,
        COALESCE(es.status, 'active')::TEXT,
        es.is_deleted,
        es.created_at,
        COALESCE(s.site_name, '')::TEXT AS site_name
    FROM public.edge_servers es
    LEFT JOIN public.sites s ON s.id = es.site_id
    WHERE es.is_deleted = FALSE
      AND (p_site_id IS NULL OR es.site_id = p_site_id)
    ORDER BY es.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.create_edge_server(
    p_site_id INTEGER,
    p_server_name TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_mac_address TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'active'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_server_id INTEGER;
BEGIN
    IF COALESCE(trim(p_server_name), '') = '' THEN
        RAISE EXCEPTION 'Server name is required';
    END IF;

    INSERT INTO public.edge_servers (site_id, server_name, ip_address, mac_address, status)
    VALUES (
        p_site_id,
        trim(p_server_name),
        NULLIF(trim(COALESCE(p_ip_address, '')), ''),
        NULLIF(trim(COALESCE(p_mac_address, '')), ''),
        COALESCE(NULLIF(lower(trim(COALESCE(p_status, ''))), ''), 'active')
    )
    RETURNING id INTO v_server_id;

    RETURN v_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_edge_server(
    p_edge_server_id INTEGER,
    p_site_id INTEGER,
    p_server_name TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_mac_address TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'active'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    IF COALESCE(trim(p_server_name), '') = '' THEN
        RAISE EXCEPTION 'Server name is required';
    END IF;

    UPDATE public.edge_servers
    SET
        site_id = p_site_id,
        server_name = trim(p_server_name),
        ip_address = NULLIF(trim(COALESCE(p_ip_address, '')), ''),
        mac_address = NULLIF(trim(COALESCE(p_mac_address, '')), ''),
        status = COALESCE(NULLIF(lower(trim(COALESCE(p_status, ''))), ''), 'active')
    WHERE id = p_edge_server_id
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Edge server "%" was not found', p_edge_server_id;
    END IF;

    RETURN p_edge_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_edge_server(
    p_edge_server_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    UPDATE public.edge_servers
    SET
        is_deleted = TRUE,
        status = 'inactive'
    WHERE id = p_edge_server_id
      AND is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Edge server "%" was not found', p_edge_server_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
    p_site_id INTEGER DEFAULT NULL,
    p_start TIMESTAMPTZ DEFAULT NULL,
    p_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    sites BIGINT,
    users BIGINT,
    cameras BIGINT,
    cameras_online BIGINT,
    cameras_offline BIGINT,
    edge_servers BIGINT,
    edge_servers_online BIGINT,
    edge_servers_offline BIGINT,
    employees BIGINT,
    total_events BIGINT,
    frs_detections BIGINT,
    unknown_faces BIGINT,
    ppe_detections BIGINT,
    ppe_violations BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
    WITH bounds AS (
        SELECT
            COALESCE(p_start, NOW() - INTERVAL '1 day') AS start_at,
            COALESCE(p_end, NOW()) AS end_at
    )
    SELECT
        (SELECT COUNT(*) FROM public.sites s WHERE p_site_id IS NULL OR s.id = p_site_id) AS sites,
        (SELECT COUNT(*) FROM public.users u WHERE u.is_deleted = FALSE AND (p_site_id IS NULL OR u.site_id = p_site_id)) AS users,
        (SELECT COUNT(*) FROM public.cameras c WHERE c.is_deleted = FALSE AND (p_site_id IS NULL OR c.site_id = p_site_id)) AS cameras,
        (SELECT COUNT(*) FROM public.cameras c WHERE c.is_deleted = FALSE AND c.status = 'active' AND (p_site_id IS NULL OR c.site_id = p_site_id)) AS cameras_online,
        (SELECT COUNT(*) FROM public.cameras c WHERE c.is_deleted = FALSE AND c.status = 'inactive' AND (p_site_id IS NULL OR c.site_id = p_site_id)) AS cameras_offline,
        (SELECT COUNT(*) FROM public.edge_servers es WHERE es.is_deleted = FALSE AND (p_site_id IS NULL OR es.site_id = p_site_id)) AS edge_servers,
        (SELECT COUNT(*) FROM public.edge_servers es WHERE es.is_deleted = FALSE AND es.status = 'active' AND (p_site_id IS NULL OR es.site_id = p_site_id)) AS edge_servers_online,
        (SELECT COUNT(*) FROM public.edge_servers es WHERE es.is_deleted = FALSE AND es.status = 'inactive' AND (p_site_id IS NULL OR es.site_id = p_site_id)) AS edge_servers_offline,
        (SELECT COUNT(*) FROM public.employees e WHERE e.is_deleted = FALSE AND (p_site_id IS NULL OR e.site_id = p_site_id)) AS employees,
        (
            SELECT COUNT(*)
            FROM public.events ev, bounds b
            WHERE ev.event_time >= b.start_at
              AND ev.event_time <= b.end_at
              AND (p_site_id IS NULL OR ev.site_id = p_site_id)
        ) AS total_events,
        (
            SELECT COUNT(*)
            FROM public.events ev, bounds b
            WHERE ev.event_time >= b.start_at
              AND ev.event_time <= b.end_at
              AND UPPER(COALESCE(ev.event_type, '')) ~ '(FRS|FACE)'
              AND (p_site_id IS NULL OR ev.site_id = p_site_id)
        ) AS frs_detections,
        (
            SELECT COUNT(*)
            FROM public.events ev, bounds b
            WHERE ev.event_time >= b.start_at
              AND ev.event_time <= b.end_at
              AND ev.employee_id IS NULL
              AND (p_site_id IS NULL OR ev.site_id = p_site_id)
        ) AS unknown_faces,
        (
            SELECT COUNT(*)
            FROM public.events ev, bounds b
            WHERE ev.event_time >= b.start_at
              AND ev.event_time <= b.end_at
              AND UPPER(COALESCE(ev.event_type, '')) ~ '(PPE|HELMET|VEST|GLOVE|GOGGLES)'
              AND (p_site_id IS NULL OR ev.site_id = p_site_id)
        ) AS ppe_detections,
        (
            SELECT COUNT(*)
            FROM public.violations v
            JOIN public.cameras c ON c.id = v.camera_id, bounds b
            WHERE v.timestamp >= b.start_at
              AND v.timestamp <= b.end_at
              AND (p_site_id IS NULL OR c.site_id = p_site_id)
        ) AS ppe_violations;
$$;

CREATE OR REPLACE FUNCTION public.list_dashboard_events(
    p_site_id INTEGER DEFAULT NULL,
    p_start TIMESTAMPTZ DEFAULT NULL,
    p_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    event_time TIMESTAMP,
    event_type TEXT,
    confidence_score NUMERIC,
    camera_name TEXT,
    site_name TEXT,
    employee_name TEXT,
    employee_id INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
    SELECT
        ev.id,
        ev.event_time,
        ev.event_type::TEXT,
        ev.confidence_score,
        COALESCE(c.camera_name, '')::TEXT AS camera_name,
        COALESCE(s.site_name, '')::TEXT AS site_name,
        COALESCE(e.name, '')::TEXT AS employee_name,
        ev.employee_id
    FROM public.events ev
    LEFT JOIN public.cameras c ON c.id = ev.camera_id
    LEFT JOIN public.sites s ON s.id = ev.site_id
    LEFT JOIN public.employees e ON e.id = ev.employee_id
    WHERE (p_start IS NULL OR ev.event_time >= p_start)
      AND (p_end IS NULL OR ev.event_time <= p_end)
      AND (p_site_id IS NULL OR ev.site_id = p_site_id)
    ORDER BY ev.event_time DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_dashboard_violations(
    p_site_id INTEGER DEFAULT NULL,
    p_start TIMESTAMPTZ DEFAULT NULL,
    p_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    violation_time TIMESTAMP,
    violation_type TEXT,
    status TEXT,
    camera_name TEXT,
    site_name TEXT,
    employee_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
    SELECT
        v.id,
        v.timestamp AS violation_time,
        v.violation_type::TEXT,
        COALESCE(v.status, 'open')::TEXT,
        COALESCE(c.camera_name, '')::TEXT AS camera_name,
        COALESCE(s.site_name, '')::TEXT AS site_name,
        COALESCE(e.name, '')::TEXT AS employee_name
    FROM public.violations v
    LEFT JOIN public.cameras c ON c.id = v.camera_id
    LEFT JOIN public.sites s ON s.id = c.site_id
    LEFT JOIN public.employees e ON e.id = v.employee_id
    WHERE (p_start IS NULL OR v.timestamp >= p_start)
      AND (p_end IS NULL OR v.timestamp <= p_end)
      AND (p_site_id IS NULL OR c.site_id = p_site_id)
    ORDER BY v.timestamp DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_dashboard_edge_servers(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_edge_server(INTEGER, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_edge_server(INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_edge_server(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_dashboard_events(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_dashboard_violations(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- Ensure API roles can read the schema and tables used by the dashboard.
GRANT USAGE ON SCHEMA public TO anon, authenticated, authenticator;
GRANT SELECT ON public.roles TO anon, authenticated, authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, authenticator;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated, authenticator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
