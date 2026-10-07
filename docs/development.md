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

Tests exercise invalid configuration, file EOF, cleanup after consumer failure,
and device reporting when the predictor owns a separate model copy. The CUDA
device tests mock the GPU-name lookup; tests do not download weights or require
a GPU. Install the project's runtime and development dependencies first.

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

## Local validation: 2026-10-07

The earlier installation blockers have been resolved. Validation used Windows,
Python 3.14.0, an NVIDIA GeForce RTX 5060 Ti, torch 2.14.0+cu130,
torchvision 0.29.1+cu130, Ultralytics 8.4.174, OpenCV 5.0.0.93, and lap 0.5.13.
The local venv exposes global packages. A clean isolated environment remains the
recommended setup for contributors; this session did not validate a fresh install.
OpenCV 5 is now allowed by the package metadata following these runs.

The local clip contains 414 frames at 25 FPS (16.56 seconds). Its provenance has
not yet been recorded in the repository; no footage or weights are distributed.
All runs below use YOLO11n, ByteTrack, image size 640, confidence 0.10, and IoU 0.70.

| Run | Frames | Device | Processing FPS | Mean inference | Stop reason |
| --- | ---: | --- | ---: | ---: | --- |
| Corrected full-file run, no preview | 414 | cuda:0 | 56.47 | 6.14 ms | end_of_file |
| Short CPU check, no preview | 30 | cpu | 31.25 | 19.31 ms | frame_limit |

The GPU run took 7.33 seconds of processing plus 16.42 seconds of setup. The CPU
check took 0.96 seconds of processing plus 1.14 seconds of setup. These runs use
different frame counts and are not a controlled CPU/GPU speedup benchmark.
Preview, disk I/O, warm-up, and system load affect observed times.

Five earlier full-file runs each processed all 414 frames with at least one
tracked person in every frame and assigned 51 distinct track IDs. All five
produced the same tracking hash, and the corrected GPU run matched it:

```text
8baaa388084500b572130a494f538f4a504065cacd160c21308fc53c8418e8b5
```

The maintainer visually inspected the results and considers detection/tracking
sufficient to proceed with line counting. This is a qualitative review of one
clip, not measured precision, recall, ID-switch frequency, or a distinct-person
count. A documented sample license and manual Q/Escape/Ctrl+C checks remain open.

Automated validation: 12 tests pass, including separate CUDA-copy and CPU device
reporting cases. Ruff import-order findings were corrected.

## Why device reporting changed

In the installed Ultralytics version, the predictor deep-copies the original
model before selecting the inference device. Reading `model.model.parameters()`
therefore inspected the original CPU model, even when the predictor used CUDA.
After warm-up, ZoneLens now reads `model.predictor.device` and derives the GPU
name from that same device. CPU runs report `gpu: null` even with CUDA available.
The `cuda_runtime` field describes the installed PyTorch build, so it may still
say `13.0` during a CPU run. Previous local output files are retained unchanged;
generate a new run to get corrected metadata.

An earlier `torchvision::nms` CUDA failure was a separate installation issue:
torchvision was a CPU build. GPU availability in torch alone is not sufficient;
both packages need compatible CUDA builds. See the README's direct NMS check.

## References

- [PyTorch installation](https://pytorch.org/get-started/locally/)
- [Official CUDA 13.0 torch wheels](https://download.pytorch.org/whl/cu130/torch/)
- [Official CUDA 13.0 torchvision wheels](https://download.pytorch.org/whl/cu130/torchvision/)
- [Ultralytics tracking](https://docs.ultralytics.com/modes/track/)
- [YOLO11 models](https://docs.ultralytics.com/models/yolo11/)
