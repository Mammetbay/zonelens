"""Command line entry point for the file prototype."""

import argparse
from dataclasses import replace
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="ZoneLens video-file prototype")
    parser.add_argument("source", type=Path, help="Local video file")
    parser.add_argument("--read-only", action="store_true", help="Decode without loading a model")
    parser.add_argument("--config", type=Path, help="TOML inference configuration")
    parser.add_argument("--device", choices=["auto", "cpu", "0"])
    parser.add_argument(
        "--output", type=Path, default=Path("outputs/run"), help="New output directory"
    )
    parser.add_argument("--show", action="store_true", help="Open a preview; Q or Escape stops")
    parser.add_argument("--max-frames", type=int, help="Stop after this many frames")
    args = parser.parse_args()
    try:
        import cv2

        from app.vision.source import VideoSource

        if args.max_frames is not None and args.max_frames < 1:
            raise ValueError("--max-frames must be positive")
        if args.read_only:
            with VideoSource(args.source) as source:
                count = sum(1 for _ in source)
                print(f"Read {count} frames at source FPS {source.fps:.2f}")
        else:
            from app.vision.config import Config
            from app.vision.pipeline import run

            config = Config.load(args.config)
            if args.device:
                config = replace(config, device=args.device)
            run(args.source, config, args.output, args.show, args.max_frames)
    except ModuleNotFoundError as exc:
        parser.exit(1, f"Missing dependency: {exc.name}. Install the README requirements first.\n")
    except (ValueError, OSError, RuntimeError) as exc:
        parser.exit(1, f"Error: {exc}\n")
    except cv2.error as exc:
        parser.exit(1, f"OpenCV error: {exc}\n")
    except KeyboardInterrupt:
        parser.exit(130, "Stopped; video resources released. Partial output may remain.\n")


if __name__ == "__main__":
    main()
