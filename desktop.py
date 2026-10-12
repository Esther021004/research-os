"""macOS desktop entry point. Never reads or migrates an existing installation."""
import fcntl
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading

PORT = 18090  # Stable origin keeps WebKit localStorage across launches.


def alert(message):
    # Pass text as an argument, not interpolated AppleScript source.
    subprocess.run(['osascript', '-e', 'on run argv', '-e',
                    'display alert "Research OS" message (item 1 of argv)',
                    '-e', 'end run', message], check=False)


def main():
    if sys.platform != 'darwin':
        raise RuntimeError('현재 설치형 앱은 macOS 전용입니다.')
    support = Path.home() / 'Library' / 'Application Support' / 'Research OS'
    support.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.environ['RESEARCH_OS_CLEAN'] = '1'
    os.environ['RESEARCH_OS_DATA_DIR'] = str(support / 'data-release')
    resource = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
    os.environ['PATH'] = str(resource / 'pdf-tools') + os.pathsep + os.environ.get('PATH', '')
    lock = (support / 'desktop.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        alert('Research OS가 이미 실행 중입니다. Dock에서 기존 창을 확인해 주세요.')
        return
    httpd = None
    worker = None
    try:
        missing = [name for name in ('pdftotext', 'pdfinfo', 'pdftoppm') if not shutil.which(name)]
        if missing:
            raise RuntimeError('PDF 도구가 누락되었습니다. 완전한 배포 패키지가 필요합니다: ' + ', '.join(missing))
        import webview
        from server import AppHandler, ThreadingHTTPServer
        try:
            httpd = ThreadingHTTPServer(('127.0.0.1', PORT), AppHandler)
        except OSError as exc:
            raise RuntimeError('앱 전용 포트 18090을 사용할 수 없습니다. 다른 프로그램이 사용 중인지 확인해 주세요. 기존 프로그램은 종료하지 않았습니다.') from exc
        httpd.daemon_threads = True
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        webview.settings['ALLOW_DOWNLOADS'] = True
        webview.create_window('Research OS', f'http://127.0.0.1:{PORT}/',
                              width=1320, height=900, min_size=(900, 650))
        webview.start(private_mode=False, storage_path=str(support / 'webview'), debug=False)
    except Exception as exc:
        alert('앱을 시작하지 못했습니다. 연구 데이터는 삭제되지 않았습니다.\n' + str(exc))
    finally:
        if httpd:
            if worker:
                httpd.shutdown()
                worker.join(timeout=3)
            httpd.server_close()
        lock.close()


if __name__ == '__main__':
    if '--self-test' in sys.argv:
        # Import checks only: do not open user records, bind a port or call an AI.
        os.environ['RESEARCH_OS_CLEAN'] = '1'
        import claude_backend
        import agent_backend
        import server
        import json
        resource = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
        assert (resource / 'auth-ui.js').is_file()
        assert 'save-claude-path' in (resource / 'auth-ui.js').read_text(encoding='utf-8')
        print(json.dumps({'version': '0.2.0', 'claude_adapter': True, 'assets': True}))
    else:
        main()
