import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text


BASE_DIR = Path(__file__).resolve().parent
ADMIN_EMAIL = 'admin@hyperspark.io'
ADMIN_PASSWORD = 'Admin@12345'


def run_migration() -> None:
    load_dotenv(dotenv_path=BASE_DIR / '.env')

    raw_url = os.getenv('Postgresql_Url')
    if not raw_url:
        print('ERROR: Postgresql_Url not found in .env')
        return

    clean_url = raw_url.strip().strip("'").strip('"')
    migration_sql = (BASE_DIR / 'dashboard_migration.sql').read_text(encoding='utf-8')

    try:
        print('Connecting to the database...')
        engine = create_engine(clean_url, pool_pre_ping=True)

        with engine.begin() as connection:
            print('Applying dashboard_migration.sql...')
            connection.execute(text(migration_sql))

        print('SUCCESS: Dashboard schema migration completed.')
        print(f'Admin email: {ADMIN_EMAIL}')
        print(f'Admin password: {ADMIN_PASSWORD}')
    except Exception as error:
        print(f'ERROR: Dashboard migration failed:\n{error}')


if __name__ == '__main__':
    run_migration()
