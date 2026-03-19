-- Database schema for the monitoring dashboard.
-- This file defines the base tables. Incremental fixes, RPC functions,
-- and the seeded admin account are applied in dashboard_migration.sql.

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (role_name, description)
VALUES
    ('admin', 'Full access to the system'),
    ('user', 'Limited standard user access')
ON CONFLICT (role_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS sites (
    id SERIAL PRIMARY KEY,
    site_name VARCHAR(150) NOT NULL,
    address TEXT,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) DEFAULT 'supabase_auth_managed',
    role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active',
    is_deleted BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edge_servers (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    server_name VARCHAR(150) NOT NULL,
    ip_address VARCHAR(50),
    mac_address VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cameras (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    edge_server_id INTEGER REFERENCES edge_servers(id) ON DELETE SET NULL,
    camera_name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    rtsp_url TEXT,
    description TEXT,
    ai_model VARCHAR(50) DEFAULT 'FRS+PPE',
    status VARCHAR(50) DEFAULT 'active',
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    department VARCHAR(100),
    designation VARCHAR(100),
    site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    face_image_path TEXT,
    face_image_paths JSONB,
    has_spectacles BOOLEAN DEFAULT FALSE,
    face_registered BOOLEAN DEFAULT FALSE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active',
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ppe_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

INSERT INTO ppe_types (name, description)
VALUES
    ('Helmet', 'Safety helmet / hard hat'),
    ('Safety Vest', 'High visibility safety vest'),
    ('Gloves', 'Safety working gloves'),
    ('Goggles', 'Safety eye goggles')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    camera_id INTEGER REFERENCES cameras(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    face_detected BOOLEAN DEFAULT FALSE,
    confidence_score DECIMAL(5, 2),
    image_path TEXT,
    bbox JSONB,
    event_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_ppe_status (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    ppe_type_id INTEGER REFERENCES ppe_types(id) ON DELETE CASCADE,
    is_worn BOOLEAN DEFAULT FALSE,
    UNIQUE(event_id, ppe_type_id)
);

CREATE TABLE IF NOT EXISTS violations (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    camera_id INTEGER REFERENCES cameras(id) ON DELETE CASCADE,
    violation_type VARCHAR(150) NOT NULL,
    image_path TEXT,
    bbox JSONB,
    timestamp TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
