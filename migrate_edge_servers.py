import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text


BASE_DIR = Path(__file__).resolve().parent


def run_migration() -> None:
    load_dotenv(dotenv_path=BASE_DIR / '.env')

    raw_url = os.getenv('Postgresql_Url')
    if not raw_url:
        print('ERROR: Postgresql_Url not found in .env')
        return

    clean_url = raw_url.strip().strip("'").strip('"')

    try:
        print('Connecting to the database...')
        engine = create_engine(clean_url, pool_pre_ping=True)

        with engine.begin() as conn:
            print('Ensuring edge_servers table exists...')
            conn.execute(text("""
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
            """))

        with engine.begin() as conn:
            print('Ensuring edge_server_id column exists on cameras...')
            conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'cameras'
                          AND column_name = 'edge_server_id'
                    ) THEN
                        ALTER TABLE cameras
                        ADD COLUMN edge_server_id INTEGER REFERENCES edge_servers(id) ON DELETE SET NULL;
                    END IF;
                END $$;
            """))

        print('SUCCESS: edge_servers migration completed.')
    except Exception as error:
        print(f'ERROR: edge_servers migration failed:\n{error}')


if __name__ == '__main__':
    run_migration()
