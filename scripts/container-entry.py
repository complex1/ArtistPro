"""Supervise the two local-only container services; Compose restricts host exposure."""
import signal
import subprocess
import sys
import time


def main():
    children = [
        subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.host.main:app", "--host", "0.0.0.0", "--port", "8765"]),
        subprocess.Popen([sys.executable, "-m", "http.server", "8080", "--bind", "0.0.0.0", "--directory", "dist"]),
    ]
    stopping = False

    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    code = 0
    try:
        while not stopping:
            for child in children:
                if child.poll() is not None:
                    code = child.returncode or 1
                    stopping = True
            time.sleep(0.1)
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
    return code


if __name__ == "__main__":
    sys.exit(main())
