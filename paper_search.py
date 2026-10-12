"""Bounded, read-only Crossref search. No arbitrary URL fetching or AI guesses."""
import json
import re
import html
import urllib.request
import urllib.error
from urllib.parse import urlencode, quote, unquote

def plain(value):
    return html.unescape(re.sub(r'<[^>]*>', '', str(value or ''))).strip()

def normalize(work):
    title = plain((work.get('title') or [''])[0])[:500]
    doi = str(work.get('DOI', '')).strip().lower()
    if not title or not re.fullmatch(r'10\.\d{4,9}/\S+', doi):
        return None
    parts = (work.get('published') or work.get('issued') or {}).get('date-parts') or [[]]
    return {'title': title, 'doi': doi, 'source': 'https://doi.org/'+quote(doi, safe='/'),
            'authors': ', '.join(plain(' '.join(filter(None, [a.get('given'), a.get('family')]))) or plain(a.get('name')) for a in work.get('author', []))[:3000],
            'year': str(parts[0][0]) if parts and parts[0] else '',
            'venue': plain((work.get('container-title') or [''])[0])[:500], 'provider': 'Crossref'}

def search(query):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 500:
        raise ValueError('검색할 제목 또는 DOI를 2~500자로 입력해 주세요.')
    query = query.strip()
    match = re.fullmatch(r'(?:https?://(?:dx\.)?doi\.org/|doi:\s*)?(10\.\d{4,9}/\S+)', unquote(query), re.I)
    url = 'https://api.crossref.org/works'
    url += '/'+quote(match.group(1), safe='') if match else '?'+urlencode({'query.bibliographic': query, 'rows': 8})
    request = urllib.request.Request(url, headers={'User-Agent':'ResearchOS/1.0 (local academic library)', 'Accept':'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read(2_000_001)
        if len(raw)>2_000_000:
            raise ValueError('검색 응답이 너무 큽니다. 제목을 더 구체적으로 입력해 주세요.')
        body = json.loads(raw)['message']
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return {'items': [], 'provider':'Crossref'}
        raise ValueError('학술 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.') from None
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, json.JSONDecodeError):
        raise ValueError('학술 검색 응답을 받지 못했습니다. 연결을 확인하고 다시 시도해 주세요.') from None
    items, seen = [], set()
    for work in ([body] if match else body.get('items', [])):
        item = normalize(work)
        if item and item['doi'] not in seen:
            seen.add(item['doi']);items.append(item)
    return {'items':items[:8], 'provider':'Crossref'}
