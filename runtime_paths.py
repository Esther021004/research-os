"""Separate immutable application resources from per-user research data."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CLEAN = os.environ.get('RESEARCH_OS_CLEAN') == '1' or not (ROOT / 'demo-data.js').is_file()
DATA = Path(os.environ.get('RESEARCH_OS_DATA_DIR', str(ROOT / ('data-release' if CLEAN else 'data')))).expanduser().resolve()


def uploaded_pdf(value, uploads):
    # Keep stored file references portable between web and desktop installations.
    reference = Path(value)
    if reference.is_absolute():
        path = reference.resolve()
    elif reference.parts[:2] == ('data', 'uploads') and len(reference.parts) == 3:
        path = (uploads / reference.name).resolve()
    else:
        raise ValueError('올바른 업로드 PDF가 아닙니다.')
    if path.parent != uploads.resolve() or path.suffix.lower() != '.pdf' or not path.is_file():
        raise ValueError('올바른 업로드 PDF가 아닙니다.')
    return path
