"""从 GitHub 执行公开 HTTPS 验证；无需玩家配置环境或账号。"""
import concurrent.futures
import datetime
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

commit = os.environ['PREVIEW_COMMIT']
repository = os.environ['PREVIEW_REPOSITORY']
expected = hashlib.sha256(Path('play.xhtml').read_bytes()).hexdigest()
urls = [f'https://rawcdn.githack.com/{repository}/{commit}/play.xhtml',
        f'https://raw.githack.com/{repository}/{commit}/play.xhtml']

def check(url):
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'EmergencyRescue-PreviewCheck/1.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
            return {'url': url, 'http_status': response.status,
                    'content_type': response.headers.get('Content-Type', ''),
                    'content_disposition': response.headers.get('Content-Disposition', ''),
                    'content_security_policy': response.headers.get('Content-Security-Policy', ''),
                    'bytes': len(data), 'hash_matches': hashlib.sha256(data).hexdigest() == expected}
    except Exception as error:
        return {'url': url, 'error': str(error)[:300], 'hash_matches': False}

results = []
for attempt in range(4):
    with concurrent.futures.ThreadPoolExecutor() as executor:
        results = list(executor.map(check, urls))
    if any(r.get('http_status') == 200 and r['hash_matches'] and 'html' in r.get('content_type', '') for r in results):
        break
    time.sleep(10)

payload = {'commit': commit, 'expected_sha256': expected,
           'game_sha256': hashlib.sha256(Path('index.html').read_bytes()).hexdigest(),
           'verified_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'results': results}
Path('preview-status.json').write_text(json.dumps(payload, indent=2) + '\n')
print(json.dumps(payload, indent=2))
