# Implementation status

## M0: environment and video input

- [x] Python package scaffold and local virtual environment.
- [x] GitHub access and NVIDIA driver inspection.
- [x] Sequential file reader with cleanup and a read-only CLI mode.
- [x] CPU selection and automatic CPU fallback when CUDA is unavailable.
- [x] Installation and run instructions.
- [ ] Complete dependency installation and actual GPU model inference.
- [ ] Choose a person video and document its usage/redistribution rights.
- [ ] Run the file to EOF and verify output cleanup on Windows.

## M1: person detection and tracking

- [x] Implement COCO person detection with YOLO11n and ByteTrack.
- [x] Render boxes, confidence, tracking IDs, and separate FPS measurements.
- [x] Configure model, image size, thresholds, and device through TOML.
- [x] Write annotated video, frame records, and a machine-readable summary.
- [ ] Visually inspect results on a real person video.
- [ ] Repeat the same video and record comparison and performance results.

Implementation is present; runtime acceptance remains pending. Follow-up issues
are maintained in [GPU/video acceptance #1](https://github.com/Mammetbay/zonelens/issues/1)
and [sample footage #2](https://github.com/Mammetbay/zonelens/issues/2).
M2 line crossing, web UI, and camera support are outside
this prototype task.
