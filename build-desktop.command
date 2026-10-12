#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"
trap 'print "빌드가 중단되었습니다. 위 오류를 확인해 주세요."' ZERR
if [[ "$(uname -s)" != Darwin ]]; then
  print "이 빌드는 macOS에서 실행해야 합니다."
  exit 1
fi
for tool in pdftotext pdfinfo pdftoppm; do
  if ! command -v "$tool" >/dev/null; then
    print "빌드 컴퓨터에 Poppler가 필요합니다: brew install poppler"
    exit 1
  fi
done
if [[ ! -x .desktop-venv/bin/python ]]; then
  python3 -m venv .desktop-venv
fi
.desktop-venv/bin/python -m pip install -r desktop-requirements.txt
# Use a new destination each time; never overwrite a previous build.
build_dir=$(mktemp -d "$PWD/desktop-build-XXXXXX")
.desktop-venv/bin/python -m PyInstaller --distpath "$build_dir/dist" --workpath "$build_dir/work" ResearchOS.spec
print "개발용 앱 생성 완료: $build_dir/dist/Research OS.app"
print "아직 Apple 공증 및 다른 Mac 호환성 검증이 되지 않은 개발 빌드입니다."
print "배포 전에 PDF 처리·로그인·파일 내보내기·재실행 후 저장을 확인하세요."
open "$build_dir/dist"
