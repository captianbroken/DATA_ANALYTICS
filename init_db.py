import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text


BASE_DIR = Path(__file__).resolve().parent


def init_db() -> None:
    load_dotenv(dotenv_path=BASE_DIR / '.env')

    raw_url = os.getenv('Postgresql_Url')
    if not raw_url:
        print('ERROR: Postgresql_Url not found in .env')
        return

    clean_url = raw_url.strip().strip("'").strip('"')
    sql_files = [
        BASE_DIR / 'schema.sql',
        BASE_DIR / 'dashboard_migration.sql',
    ]

    try:
        print('Connecting to the database...')
        engine = create_engine(clean_url, pool_pre_ping=True)

        with engine.begin() as connection:
            for sql_file in sql_files:
                print(f'Executing {sql_file.name}...')
                connection.execute(text(sql_file.read_text(encoding='utf-8')))

        print('SUCCESS: Base schema, dashboard migration, and admin seed completed.')
    except Exception as error:
        print(f'Database initialization failed:\n{error}')


if __name__ == '__main__':
    init_db()
