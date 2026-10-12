#!/bin/zsh
set -e
cd "${0:A:h}"
trap 'print "실행하지 못했습니다. 위 오류를 확인해 주세요."; read "?Enter를 누르면 닫힙니다."' ZERR
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import jwt, cryptography' >/dev/null 2>&1; then
  print "처음 실행에 필요한 로그인 보안 라이브러리를 설치합니다."
  .venv/bin/python -m pip install -r requirements.txt
fi
print "이 창을 열어 두고 http://127.0.0.1:8090 으로 접속하세요. 종료: Control+C"
.venv/bin/python server.py
