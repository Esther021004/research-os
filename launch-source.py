"""User-friendly source launcher. Bind before opening browser; no process killing."""
import os
from pathlib import Path
import shutil
import threading
import webbrowser


def main():
    tools = Path(__file__).resolve().parent / 'tools' / 'poppler' / 'bin'
    os.environ['PATH'] = str(tools) + os.pathsep + os.environ.get('PATH', '')
    from server import AppHandler, ThreadingHTTPServer
    missing = [tool for tool in ('pdftotext', 'pdfinfo', 'pdftoppm') if not shutil.which(tool)]
    if missing:
        print('PDF 기능은 Poppler 설치 후 사용할 수 있습니다. 일반 기록 관리는 사용할 수 있습니다.')
        print('Missing PDF tools: ' + ', '.join(missing))
    port = int(os.environ.get('PORT', '8090'))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), AppHandler)
    except OSError as error:
        raise RuntimeError(f'포트 {port}를 사용할 수 없습니다. 기존 Research OS가 실행 중인지 확인하세요.') from error
    server.daemon_threads = True
    url = f'http://127.0.0.1:{port}'
    print(f'Research OS: {url}\n이 창을 열어 두세요. 종료: Ctrl+C')
    opener = threading.Timer(0.6, lambda: webbrowser.open(url))
    opener.daemon = True
    opener.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        opener.cancel()
        server.server_close()


if __name__ == '__main__':
    main()
