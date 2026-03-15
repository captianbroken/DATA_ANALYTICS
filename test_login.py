import os
import requests
from dotenv import load_dotenv

load_dotenv()

url = os.getenv('VITE_SUPABASE_URL')
key = os.getenv('VITE_SUPABASE_ANON_KEY')

auth_url = f'{url}/auth/v1/token?grant_type=password'
payload = {'email': 'admin@hyperspark.io', 'password': 'Admin@12345'}
headers = {'apikey': key, 'Content-Type': 'application/json'}

print('Testing login...')
try:
    r = requests.post(auth_url, json=payload, headers=headers, timeout=5)
    if r.status_code == 200:
        print('✓✓✓ LOGIN SUCCESSFUL ✓✓✓')
    else:
        print(f'Status: {r.status_code}')
        print(f'Response: {r.text[:150]}')
except Exception as e:
    print(f'Error: {e}')
