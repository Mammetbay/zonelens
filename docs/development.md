# Development and validation

## Architecture

- `backend/app/cli.py`: command arguments and actionable errors.
- `backend/app/vision/source.py`: sequential OpenCV decoding and resource cleanup.
- `backend/app/vision/config.py`: validated TOML settings.
- `backend/app/vision/pipeline.py`: one YOLO/ByteTrack session per file, rendering and measurements.

Frames are NumPy arrays with height, width, and BGR color channels. YOLO produces
bounding boxes and confidence scores; ByteTrack links detections across frames.
Class 0 is `person` in the supported COCO pretrained models. Confidence is a
model score, not a calibrated probability. The default low detection threshold
keeps candidates useful to ByteTrack's second association stage.

The file reader does not skip frames. Each CLI invocation starts a fresh tracker.
Video timestamps use frame index divided by source FPS, so constant frame rate
footage is required for meaningful timestamps. IDs are temporary, can change
after occlusion, and must not be interpreted as unique people counts.

## Short checks

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check backend
```

Tests exercise invalid configuration, file EOF, and cleanup after consumer failure.
They do not download models or require a GPU.

## Manual acceptance (M0/M1)

1. Use a short constant frame rate video containing people. Record its owner and
   redistribution permission in your local notes; do not commit private footage.
2. Run `--read-only` and confirm the expected number of frames is decoded.
3. Run with `--device 0 --show`; check boxes, confidence, IDs, and the two FPS values.
4. Confirm `summary.json` says `device: cuda:0`, `cuda_runtime: 13.0`,
   `stop_reason: end_of_file`, and
   `tracked_frames` is nonzero. Open `annotated.mp4` and inspect moving people.
5. Repeat with identical settings in a new output directory. Compare
   `tracks_sha256` in both summaries and inspect any differences. GPU operations
   and library versions may affect reproducibility; matching hashes do not prove accuracy.
6. Run a short `--device cpu --max-frames 30` comparison. Record processing FPS
   separately from source FPS; do not promise a fixed GPU speedup.
7. Try Q, Escape, and Ctrl+C and confirm the process exits and files can be reopened.

`processing_fps` includes decoding, inference, tracking, drawing, file writing,
and optional preview; setup and warm-up are excluded. `mean_inference_ms` uses
Ultralytics' inference timing and excludes tracking and rendering. The overlay is
a running estimate; the final summary includes the last frame's writing/display.
Output has no audio. Preview runs at processing speed, not timed playback speed.

## Environment check: 2026-10-03

Detected on the Windows development machine:

- Python 3.14.0, pip 25.2; `python` works, but `py -0p` finds no registered interpreter.
- NVIDIA GeForce RTX 5060 Ti, 16311 MiB reported VRAM, driver 617.14.
- Node 22.21.0 and pnpm 12.8.1 (not needed for M0/M1).
- GitHub repository and connected account access verified; GitHub CLI is absent.
- A project `.venv` was created.
- The selected GPU target is now CUDA 13.0 (`cu130`), as requested by the user.
  The official index lists Python 3.14 Windows wheels for torch 2.11.0+cu130
  and torchvision 0.26.0+cu130. Installation and GPU inference are **not yet verified**.
- Historical attempt: the earlier CUDA 12.8 download failed after approximately
  24 MB of the 2771 MB torch wheel. Use the current cu130 README command going forward.

The NVIDIA driver display alone does not prove PyTorch compatibility. The real
model warm-up and file run must succeed before recording GPU acceptance.
No benchmark or tracking accuracy is claimed without a real run.

Checks completed in this session: Python compilation, `git diff --check`, loading
the example TOML, and rejection of six invalid inference settings. OpenCV,
pytest, and Ruff installation also failed to obtain packages from the configured
index and explicit PyPI index. Therefore the video tests and Ruff were not run.
Full dependency pinning should follow the first successful installation and run.

A later retry reached the PyPI index and resolved OpenCV 4.14.0.94, but its
41.2 MB wheel remained at zero downloaded bytes while the pip process stayed
alive. The stalled installation was stopped. The virtual environment still
contains only pip; complete installation in a working network environment before
running the video acceptance checks. Local commits also remain unpublished
because terminal Git authentication is unavailable, despite working connector
access for GitHub issues.

## References

- [PyTorch installation](https://pytorch.org/get-started/locally/)
- [Official CUDA 13.0 torch wheels](https://download.pytorch.org/whl/cu130/torch/)
- [Official CUDA 13.0 torchvision wheels](https://download.pytorch.org/whl/cu130/torchvision/)
- [Ultralytics tracking](https://docs.ultralytics.com/modes/track/)
- [YOLO11 models](https://docs.ultralytics.com/models/yolo11/)
