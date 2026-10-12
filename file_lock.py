"""Cross-platform exclusive credential-store lock (stdlib only)."""
import os
from contextlib import contextmanager

if os.name == 'nt':
    import msvcrt
else:
    import fcntl


@contextmanager
def exclusive_lock(stream):
    if os.name == 'nt':
        stream.seek(0)
        msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
