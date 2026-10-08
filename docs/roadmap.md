# Implementation status

## M0: environment and video input

- [x] Python package scaffold and local virtual environment.
- [x] GitHub access and NVIDIA driver inspection.
- [x] Sequential file reader with cleanup and a read-only CLI mode.
- [x] CPU selection and automatic CPU fallback when CUDA is unavailable.
- [x] Installation and run instructions.
- [x] Complete dependency installation and actual GPU model inference.
- [ ] Choose a person video and document its usage/redistribution rights.
- [x] Run the file to EOF and produce output on Windows.
- [ ] Manually verify Q, Escape, and Ctrl+C cleanup on Windows.

## M1: person detection and tracking

- [x] Implement COCO person detection with YOLO11n and ByteTrack.
- [x] Render boxes, confidence, tracking IDs, and separate FPS measurements.
- [x] Configure model, image size, thresholds, and device through TOML.
- [x] Write annotated video, frame records, and a machine-readable summary.
- [x] Visually inspect results on a real person video (maintainer review).
- [x] Repeat the same video and record comparison and performance results.
- [x] Report the active predictor device, with CPU/CUDA regression coverage.

Core M0/M1 functionality has been exercised on a 414-frame person clip. The
maintainer considers YOLO11n sufficient for the next step based on visual review;
this is not a labeled accuracy benchmark. See [validation results](development.md).
Remaining acceptance work includes sample provenance and manual interruption
checks. Follow-up issues
are maintained in [GPU/video acceptance #1](https://github.com/Mammetbay/zonelens/issues/1)
and [sample footage #2](https://github.com/Mammetbay/zonelens/issues/2).

## M2: line crossing (implemented; manual validation pending)

- [x] Configure a counting line and crossing directions.
- [x] Count crossings using track movement without counting every frame.
- [x] Test direction, repeated crossings, and track loss.
- [ ] Compare results against a manual count on documented footage.

The rule uses the tracked box bottom-center point, a finite normalized segment,
a pixel deadband, and configurable track expiry. Crossings are written to
`events.jsonl`; direction totals appear on the video and in `summary.json`.
Use `configs/line.toml` as the starting configuration. Automated tests cover
geometry, direction, jitter, loss, and output integration; these do not establish
real-world counting accuracy.

## Later milestones

- [ ] Zone occupancy and dwell-time events.
- [ ] FastAPI, SQLite event storage, and a React web interface.
- [ ] Webcam/RTSP input and reconnection handling.
- [ ] Parking occupancy and release packaging.
