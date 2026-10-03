"""Command line entry point for the file prototype."""

import argparse
from pathlib import Path

from app.vision.source import VideoSource


def main():
    parser = argparse.ArgumentParser(description="ZoneLens video-file prototype")
    parser.add_argument("source", type=Path, help="Local video file")
    args = parser.parse_args()
    try:
        with VideoSource(args.source) as source:
            count = sum(1 for _ in source)
            print(f"Read {count} frames at source FPS {source.fps:.2f}")
    except ValueError as exc:
        parser.exit(1, f"Error: {exc}\n")


if __name__ == "__main__":
    main()
