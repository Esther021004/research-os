"""Local SIWC public client. Credentials never cross into the browser or paper DB.

Protocol: https://developers.openai.com/siwc/token-sharing-open-source/sign-in
Only loopback hosting is supported. OAuth completion always requires the user.
"""
import base64
import contextlib
import fcntl
import hashlib
import json
import os
import re
import secrets
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlencode, urlparse

try:
    import jwt
except ImportError:
    jwt = None

ISSUER = 'https://auth.openai.com'
AUTHORIZE = ISSUER + '/api/accounts/authorize'
TOKEN = ISSUER + '/api/accounts/oauth/token'
RESOURCE = 'https://api.openai.com/v1'
SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
AUTH_DIR = Path(__file__).resolve().parent / 'data' / 'auth'
LOCK = threading.RLock()
PENDING = {}
SESSIONS = {}


class AuthError(RuntimeError):
    def __init__(self, message, code='auth_error', status=400, request_id=''):
        super().__init__(message)
        self.code, self.status, self.request_id = code, status, request_id


def upstream_error(status, body=None, request_id=''):
    error = (body or {}).get('error', {}) if isinstance(body, dict) else {}
    code = error.get('code', '') if isinstance(error, dict) else str(error)
    messages = {
        'invalid_grant': '로그인이 만료되거나 취소되었습니다. 같은 계정으로 다시 로그인해 주세요.',
        'subscription_sharing_user_not_eligible': '이 계정·워크스페이스에서는 ChatGPT 플랜 연동이 허용되지 않습니다.',
        'subscription_sharing_usage_limit_exceeded': 'ChatGPT 또는 이 앱의 사용 한도에 도달했습니다. ChatGPT 설정에서 사용량을 확인하세요.',
        'subscription_sharing_usage_unavailable': 'ChatGPT 사용 가능량을 확인할 수 없습니다. 잠시 후 다시 시도하세요.',
    }
    message = messages.get(code) or {401: '로그인 또는 ChatGPT 사용 권한을 다시 확인해 주세요.', 403: '계정·지역·정책에 의해 요청이 제한되었습니다.', 429: '요청 또는 사용 한도에 도달했습니다. 잠시 후 다시 시도하세요.', 503: 'ChatGPT 연결 서비스가 일시적으로 불가능하거나 이 계정에 활성화되지 않았습니다.'}.get(status, 'OpenAI 요청을 완료하지 못했습니다. 연결 상태와 선택한 모델을 확인하세요.')
    safe_code = code if re.fullmatch(r'[a-zA-Z0-9_.-]{1,100}', code) else 'upstream_error'
    return AuthError(message, safe_code, status, request_id if re.fullmatch(r'[a-zA-Z0-9_-]{1,150}', request_id or '') else '')


def open_request(request, timeout=30):
    try:
        return urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read(100000))
        except (ValueError, UnicodeError):
            body = {}
        raise upstream_error(exc.code, body, exc.headers.get('x-request-id', '')) from None
    except (urllib.error.URLError, TimeoutError):
        raise AuthError('OpenAI에 연결할 수 없습니다. 인터넷 연결을 확인하세요.', 'network_error', 503) from None


def request_json(url, form=None, access_token=None):
    headers = {'Accept': 'application/json'}
    data = None
    if form is not None:
        data = urlencode(form).encode()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if access_token:
        headers['Authorization'] = 'Bearer ' + access_token
    with open_request(urllib.request.Request(url, data=data, headers=headers)) as response:
        raw = response.read(2000000)
    return json.loads(raw) if raw.strip() else {}


@contextlib.contextmanager
def storage():
    # Serialize rotating refresh tokens across both server threads and processes.
    with LOCK:
        AUTH_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(AUTH_DIR, 0o700)
        fd = os.open(str(AUTH_DIR / 'store.lock'), os.O_CREAT | os.O_RDWR, 0o600)
        with os.fdopen(fd, 'a') as lock_file:
            fcntl.flock(lock_file, fcntl.LOCK_EX)
            path = AUTH_DIR / 'credentials.json'
            if path.exists():
                os.chmod(path, 0o600)
                record = json.loads(path.read_text())
            else:
                record = {'host_id': 'urn:uuid:' + str(uuid.uuid4()), 'accounts': {}, 'active': None, 'provider': 'chatgpt'}
            yield record
            fd, temporary = tempfile.mkstemp(dir=str(AUTH_DIR), prefix='.credentials-')
            try:
                with os.fdopen(fd, 'w') as output:
                    json.dump(record, output)
                    output.flush(); os.fsync(output.fileno())
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)


def browser_session(sid=None):
    with LOCK:
        now = time.time()
        for key in list(SESSIONS):
            if SESSIONS[key]['expires'] < now:
                del SESSIONS[key]
        if sid not in SESSIONS:
            sid = secrets.token_urlsafe(32)
            SESSIONS[sid] = {'csrf': secrets.token_urlsafe(32), 'expires': now + 43200}
        return sid, SESSIONS[sid]['csrf']


def check_csrf(sid, token):
    session = SESSIONS.get(sid)
    if not session or session['expires'] < time.time() or not secrets.compare_digest(session['csrf'], token or ''):
        raise AuthError('보안 세션이 만료되었습니다. 화면을 새로고침해 주세요.', 'csrf_failed', 403)


def public_status():
    with storage() as saved:
        active = saved['accounts'].get(saved['active'], {})
        accounts = [{'id': key, 'label': (a.get('email') or 'ChatGPT 계정') + ' · ' + key[-8:], 'signed_in': bool(a.get('access_token'))} for key, a in saved['accounts'].items()]
        return {'provider': saved['provider'], 'active': saved['active'], 'accounts': accounts,
                'connected': bool(active.get('access_token')), 'plan_enabled': 'chatgpt.tokens.use.direct' in active.get('scopes', []),
                'model': active.get('model', ''), 'dependency_ready': jwt is not None,
                'api_key_available': bool(os.getenv('OPENAI_API_KEY'))}


def begin_login(sid, port, account_id=None, consent=False):
    if jwt is None:
        raise AuthError('로그인 보안 라이브러리 설치가 필요합니다. start.command로 실행하거나 requirements.txt를 설치해 주세요.', 'dependency_missing')
    with storage() as saved:
        if account_id and account_id not in saved['accounts']:
            raise AuthError('저장된 계정을 찾지 못했습니다.')
        account = saved['accounts'].get(account_id, {})
        state, nonce, verifier = (secrets.token_urlsafe(48) for _ in range(3))
        redirect = f'http://127.0.0.1:{int(port)}/auth/callback'
        client = account.get('client_id') or SESSIONS.get(sid, {}).get('retry_client') or 'dynamic_agent_client'
        params = {'client_id': client, 'ext_agent_host_id': saved['host_id'], 'response_type': 'code', 'redirect_uri': redirect,
                  'scope': SCOPES, 'resource': RESOURCE, 'state': state, 'nonce': nonce, 'code_challenge_method': 'S256',
                  'code_challenge': base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
        if client == 'dynamic_agent_client':
            params['agent_name_hint'] = 'Research OS'
        elif account.get('id_token'):
            params['id_token_hint'] = account['id_token']
        if consent:
            params['prompt'] = 'consent'
        # One attempt per browser, with bounded lifetime. A newer click invalidates the old one.
        for key in list(PENDING):
            if PENDING[key]['expires'] < time.time() or PENDING[key]['sid'] == sid:
                del PENDING[key]
        PENDING[state] = {'sid': sid, 'nonce': nonce, 'verifier': verifier, 'redirect': redirect, 'client_id': client,
                          'subject': account.get('subject'), 'expires': time.time() + 600}
        return AUTHORIZE + '?' + urlencode(params)


def validate_identity(token, client_id, nonce=None, expected_subject=None):
    if jwt is None:
        raise AuthError('로그인 보안 라이브러리가 설치되지 않았습니다.', 'dependency_missing')
    try:
        discovery = request_json(ISSUER + '/.well-known/openid-configuration')
        if discovery.get('issuer') != ISSUER or discovery.get('jwks_uri') != ISSUER + '/.well-known/jwks.json':
            raise ValueError('Untrusted discovery')
        header = jwt.get_unverified_header(token)
        if header.get('alg') not in ('RS256', 'ES256'):
            raise ValueError('Unsupported signing algorithm')
        keys = request_json(discovery['jwks_uri'])['keys']
        matching = [key for key in keys if key.get('kid') == header.get('kid') and key.get('use', 'sig') == 'sig']
        if len(matching) != 1:
            raise ValueError('Unknown signing key')
        key = jwt.PyJWK.from_dict(matching[0], algorithm=header['alg']).key
        claims = jwt.decode(token, key, algorithms=[header['alg']], issuer=ISSUER, audience=client_id,
                            options={'require': ['iss', 'sub', 'aud', 'exp', 'iat']}, leeway=30)
        if not isinstance(claims['sub'], str) or not claims['sub']:
            raise ValueError('Invalid subject')
        if nonce is not None and not secrets.compare_digest(claims.get('nonce', ''), nonce):
            raise ValueError('Nonce mismatch')
        if expected_subject and claims['sub'] != expected_subject:
            raise ValueError('Account mismatch')
        if isinstance(claims.get('aud'), list) and len(claims['aud']) > 1 and claims.get('azp') != client_id:
            raise ValueError('Missing authorized party')
        if claims.get('azp', client_id) != client_id:
            raise ValueError('Authorized party mismatch')
        return claims
    except AuthError:
        raise
    except Exception:
        raise AuthError('로그인 서명·계정 검증에 실패했습니다. 다시 로그인해 주세요.', 'identity_invalid', 401) from None


def update_tokens(account, tokens):
    if str(tokens.get('token_type', 'Bearer')).lower() != 'bearer' or not tokens.get('access_token'):
        raise AuthError('사용 가능한 로그인 토큰을 받지 못했습니다.', 'invalid_token_response')
    for key in ('access_token', 'refresh_token', 'id_token'):
        if tokens.get(key):
            account[key] = tokens[key]
    if 'scope' in tokens:
        account['scopes'] = tokens['scope'].split()
    lifetime = int(tokens.get('expires_in', 0))
    if lifetime <= 0:
        raise AuthError('로그인 토큰의 만료 정보를 확인할 수 없습니다.', 'invalid_token_response')
    account['expires_at'] = time.time() + lifetime


def complete_login(sid, query):
    state = query.get('state', '')
    with LOCK:
        attempt = PENDING.get(state)
        if not attempt or not sid or attempt['sid'] != sid:
            raise AuthError('로그인 요청을 확인할 수 없습니다. 처음부터 다시 시도하세요.', 'state_invalid', 400)
        del PENDING[state]
        if attempt['expires'] < time.time():
            raise AuthError('로그인 요청이 만료되었습니다. 다시 시도하세요.', 'state_expired')
        if query.get('error'):
            raise AuthError('로그인이 취소되었거나 권한이 승인되지 않았습니다.', 'consent_denied')
        client = query.get('client_id') or attempt['client_id']
        if client == 'dynamic_agent_client' or not re.fullmatch(r'oaiapp_[A-Za-z0-9_-]+', client):
            raise AuthError('앱 등록이 완료되지 않았습니다. 이 계정의 연동 지원 여부를 확인하세요.', 'registration_incomplete')
        if attempt['client_id'] != 'dynamic_agent_client' and client != attempt['client_id']:
            raise AuthError('로그인 앱 식별자가 일치하지 않습니다.', 'client_mismatch')
        if not query.get('code'):
            raise AuthError('로그인 승인 코드가 없습니다.', 'code_missing')
        try:
            tokens = request_json(TOKEN, {'grant_type': 'authorization_code', 'client_id': client, 'code': query['code'],
                                         'code_verifier': attempt['verifier'], 'redirect_uri': attempt['redirect'], 'resource': RESOURCE})
        except AuthError as error:
            if error.code == 'invalid_grant' and sid in SESSIONS:
                SESSIONS[sid]['retry_client'] = client
            raise
        identity = validate_identity(tokens.get('id_token', ''), client, attempt['nonce'], attempt['subject'])
        with storage() as saved:
            previous = saved['accounts'].get(client, {})
            if previous.get('subject') and previous['subject'] != identity['sub']:
                raise AuthError('저장된 계정과 일치하지 않습니다.', 'account_mismatch')
            account = {'client_id': client, 'subject': identity['sub'], 'email': identity.get('email', ''),
                       'scopes': [], 'model': previous.get('model', '')}
            update_tokens(account, tokens)
            saved['accounts'][client] = account
            saved['active'], saved['provider'] = client, 'chatgpt'
        SESSIONS.get(sid, {}).pop('retry_client', None)


def refresh_account(account):
    if not account.get('access_token'):
        raise AuthError('먼저 ChatGPT로 로그인해 주세요.', 'login_required', 401)
    if account.get('expires_at', 0) < time.time() + 90:
        if not account.get('refresh_token'):
            raise AuthError('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'login_required', 401)
        tokens = request_json(TOKEN, {'grant_type': 'refresh_token', 'client_id': account['client_id'],
                                     'refresh_token': account['refresh_token'], 'resource': RESOURCE})
        if tokens.get('id_token'):
            validate_identity(tokens['id_token'], account['client_id'], expected_subject=account['subject'])
        update_tokens(account, tokens)
    if 'chatgpt.tokens.use.direct' not in account.get('scopes', []):
        raise AuthError('ChatGPT 플랜 사용 권한이 없습니다. 사용 권한 승인 버튼을 눌러주세요.', 'permission_missing', 403)
    return account['access_token']


def models():
    with LOCK:
        with storage() as saved:
            account = saved['accounts'].get(saved['active'], {})
            token = refresh_account(account)
            account_id = saved['active']
        # Commit a rotated refresh token before any later network call can fail.
        result = request_json(RESOURCE + '/models', access_token=token)
        catalog = [{'slug': m['slug'], 'name': m.get('display_name', m['slug'])} for m in result.get('models', []) if m.get('visibility') == 'list' and isinstance(m.get('slug'), str)]
        with storage() as saved:
            account = saved['accounts'][account_id]
            account['models'] = catalog
            if account.get('model') not in [m['slug'] for m in catalog]:
                account['model'] = ''
            return {'models': catalog, 'selected': account.get('model', '')}


def configure(data):
    with storage() as saved:
        if 'account' in data:
            if data['account'] not in saved['accounts']:
                raise AuthError('저장된 계정을 찾지 못했습니다.')
            saved['active'] = data['account']
        if 'provider' in data:
            if data['provider'] not in ('chatgpt', 'api_key'):
                raise AuthError('지원하지 않는 연결 방식입니다.')
            if data['provider'] == 'api_key' and not os.getenv('OPENAI_API_KEY'):
                raise AuthError('서버에 OPENAI_API_KEY가 설정되어 있지 않습니다.')
            saved['provider'] = data['provider']
        if 'model' in data:
            account = saved['accounts'].get(saved['active'], {})
            if data['model'] not in [m['slug'] for m in account.get('models', [])]:
                raise AuthError('모델 목록을 새로고침한 뒤 선택해 주세요.')
            account['model'] = data['model']


def logout():
    warning = ''
    with storage() as saved:
        account = saved['accounts'].get(saved['active'], {})
        if account.get('refresh_token'):
            try:
                discovery = request_json(ISSUER + '/.well-known/openid-configuration')
                endpoint = discovery.get('revocation_endpoint', '')
                parsed = urlparse(endpoint)
                if parsed.scheme != 'https' or parsed.netloc != 'auth.openai.com':
                    raise ValueError('Untrusted revocation endpoint')
                request_json(endpoint, {'token': account['refresh_token'], 'token_type_hint': 'refresh_token', 'client_id': account['client_id']})
            except Exception:
                warning = '이 컴퓨터에서는 로그아웃했습니다. 원격 연결 해제는 확인하지 못했으므로 ChatGPT 설정에서 앱 연결을 해제해 주세요.'
        for key in ('access_token', 'refresh_token', 'id_token', 'expires_at', 'models', 'scopes'):
            account.pop(key, None)
        saved['provider'] = 'chatgpt'
        with LOCK:
            PENDING.clear()
    return warning or '로그아웃했습니다. 논문과 메모는 유지됩니다.'


def read_response_stream(response):
    fragments, data_lines, size = [], [], 0
    for raw in response:
        size += len(raw)
        if size > 4000000:
            raise AuthError('분석 응답이 너무 큽니다.', 'response_too_large')
        line = raw.decode('utf-8').rstrip('\r\n')
        if line.startswith('data:'):
            data_lines.append(line[5:].lstrip())
        elif not line and data_lines:
            text = '\n'.join(data_lines); data_lines = []
            if text == '[DONE]':
                break
            event = json.loads(text)
            kind = event.get('type')
            if kind == 'response.output_text.delta':
                fragments.append(event.get('delta', ''))
            elif kind in ('response.failed', 'error'):
                raise upstream_error(400, event.get('response', event))
            elif kind == 'response.incomplete':
                raise AuthError('분석이 끝나기 전에 응답이 중단되었습니다. 결과를 저장하지 않았습니다.', 'response_incomplete')
            elif kind == 'response.completed':
                output = event.get('response', {}).get('output', [])
                texts = [p.get('text', '') for item in output for p in item.get('content', []) if p.get('type') == 'output_text']
                result = ''.join(texts or fragments)
                if not result:
                    raise AuthError('분석 결과가 비어 있거나 요청이 거절되었습니다.', 'empty_response')
                return json.loads(result)
    raise AuthError('분석 연결이 끊겼습니다. 완료되지 않은 결과는 저장하지 않았습니다.', 'stream_interrupted', 502)


def infer(prompt, schema):
    with LOCK:
        with storage() as saved:
            if saved['provider'] != 'chatgpt':
                raise AuthError('연결 방식이 변경되었습니다. 다시 시도해 주세요.')
            account = saved['accounts'].get(saved['active'], {})
            model = account.get('model')
            if not model:
                raise AuthError('AI 연결 설정에서 사용할 모델을 선택해 주세요.', 'model_required')
            token = refresh_account(account)
        payload = {'model': model, 'store': False, 'stream': True, 'input': [{'role': 'user', 'content': prompt}],
                   'text': {'format': {'type': 'json_schema', 'name': 'paper_analysis', 'strict': True, 'schema': schema}}}
        request = urllib.request.Request(RESOURCE + '/responses', data=json.dumps(payload).encode(),
                                         headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'text/event-stream'})
        # Keep account switch/sign-out serialized with the active request.
        with open_request(request, timeout=120) as response:
            return read_response_stream(response)
