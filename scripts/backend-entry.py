"""Frozen loopback-only API entrypoint for desktop distributions."""
import argparse
import multiprocessing

import uvicorn
from backend.host.main import app


if __name__ == "__main__":
    multiprocessing.freeze_support()
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
