# Build on the target Mac architecture in a clean virtual environment.
from pathlib import Path
import shutil

root = Path(SPECPATH)
assets = ['index.html', 'app.js', 'onboarding.js', 'research.js', 'reader.js', 'connections.js',
          'auth-ui.js', 'styles.css', 'research.css', 'reader.css', 'connections.css',
          'auth-ui.css', 'project-colors.css', 'paper-features.css', 'persistence.css']
binaries = []
for tool in ('pdftotext', 'pdfinfo', 'pdftoppm'):
    source = shutil.which(tool)
    if not source:
        raise RuntimeError('Missing build dependency: ' + tool)
    binaries.append((source, 'pdf-tools'))
# Explicit asset allowlist: no uploads, SQLite, auth tokens, .env or local venv.
# PyInstaller scans the PDF executables for their dependent dynamic libraries.
a = Analysis([str(root / 'desktop.py')], pathex=[str(root)], binaries=binaries,
             datas=[(str(root / name), '.') for name in assets],
             hiddenimports=['webview.platforms.cocoa', 'jwt', 'cryptography'],
             excludes=['tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6'])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='Research OS',
          debug=False, strip=False, upx=False, console=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='Research OS')
app = BUNDLE(coll, name='Research OS.app', bundle_identifier='local.researchos.desktop',
             info_plist={'CFBundleShortVersionString': '0.2.0',
                         'NSHighResolutionCapable': True,
                         'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True}})
