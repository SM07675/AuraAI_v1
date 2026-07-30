import os
import requests

api_key = os.environ.get('NVIDIA_API_KEY', '') # I will just pass a mock request to see if we get 401 instead of 404
url = 'https://integrate.api.nvidia.com/v1/audio/speech'
headers = {
    'Authorization': f'Bearer {api_key}',
    'Content-Type': 'application/json'
}
data = {
    'model': 'nvidia/magpie-tts-multilingual',
    'input': 'Hello, world!',
    'voice': 'Aria'
}

response = requests.post(url, headers=headers, json=data)
print('Status Code:', response.status_code)
print('Response:', response.text[:200])
