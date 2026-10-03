# ZoneLens

Local-first video analytics for IP cameras, webcams, and video files.

ZoneLens is an open-source project for detecting and tracking objects, counting line crossings, and monitoring user-defined zones. The goal is to build a practical computer vision application that runs on your own computer.

> **Status: early prototype.** A video-file CLI implements person detection and tracking. GPU inference and real-video acceptance are still pending; see [implementation status](docs/roadmap.md).

## Planned features

- Read video files, webcams, and RTSP camera streams.
- Detect people and follow them with temporary tracking IDs.
- Count line crossings in both directions.
- Draw zones and count visible people inside them.
- Create an event when someone stays in a zone beyond a configured time.
- View live results and event history in a web interface.
- Reconnect when a camera stream is interrupted.
- Later: detect vehicles and monitor manually defined parking spaces.

## How it will work

Video frames will pass through an object detector, a tracker, and a rule engine. The rule engine will turn movement into events such as line crossings and zone entries. A local API will provide the results to the web interface.

Tracking IDs are temporary labels, not personal identities. Face recognition and cross-camera identity matching are outside the initial scope.

## Stack

| Component | Technology |
| --- | --- |
| Computer vision | Python, OpenCV, PyTorch, Ultralytics YOLO |
| Object tracking | ByteTrack |
| Backend | FastAPI |
| Frontend | React, TypeScript, Vite |
| Event storage | SQLite |
| Live updates | WebSocket |

The initial development target is Windows 11. A small pretrained model will be used before considering fine-tuning. Hardware requirements and performance results will be published after testing.

## Roadmap

- [ ] **First prototype:** detect and track people in a video file.
- [ ] **Line counting:** count crossings and compare results with manual counts.
- [ ] **Web interface:** draw lines and zones, view live results, and browse events.
- [ ] **Camera support:** connect an RTSP camera and handle stream interruptions.
- [ ] **Parking analysis:** estimate occupancy of manually defined parking spaces.
- [ ] **First release:** provide setup instructions, sample videos, tests, and benchmarks.

## Getting started

### Windows PowerShell

Python 3.11 or newer is required. Development started with Python 3.14. Use a
project virtual environment; activation is optional when calling its executables directly.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
# Project GPU target: CUDA 13.0. This is a multi-GB download.
.\.venv\Scripts\python.exe -m pip install "torch==2.11.0+cu130" "torchvision==0.26.0+cu130" --index-url https://download.pytorch.org/whl/cu130
.\.venv\Scripts\python.exe -m pip install -e ".[dev]" --index-url https://pypi.org/simple
```

The project targets CUDA **13.0** (`cu130`). These exact packages are available
for Python 3.14 on Windows in the official index, but local installation and GPU
inference are still pending. The earlier CUDA 12.8 download attempt was abandoned.
The `+cu130` suffix selects the CUDA build explicitly, including when a different
build of the same PyTorch version is already installed.
See the [official installation guide](https://pytorch.org/get-started/locally/)
if a wheel is unavailable for your Python version. A separate CUDA Toolkit is
not required for these prebuilt wheels.

Verify the CUDA runtime used by the installed PyTorch package:

```powershell
.\.venv\Scripts\python.exe -c "import torch; print(torch.__version__, torch.version.cuda); assert torch.version.cuda == '13.0'; assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))"
```

This checks the package runtime and GPU availability; the video run below verifies
actual inference. The CUDA-enabled build also supports `--device cpu`.

Place a video you have permission to use at `samples/people.mp4`, or supply its
full path. No sample footage is bundled. Run commands from the repository root:

```powershell
# M0: decode the entire file without loading YOLO.
.\.venv\Scripts\zonelens.exe samples/people.mp4 --read-only
# M1: track people, show a preview, and save results.
.\.venv\Scripts\zonelens.exe samples/people.mp4 --config configs/video.toml --device 0 --show --output outputs/run1
# Repeat for comparison; each run requires a new output directory.
.\.venv\Scripts\zonelens.exe samples/people.mp4 --config configs/video.toml --device 0 --output outputs/run2
# Short CPU comparison.
.\.venv\Scripts\zonelens.exe samples/people.mp4 --device cpu --max-frames 30 --output outputs/cpu
```

The first tracking run downloads `yolo11n.pt` from Ultralytics. Later runs can
use the cached weights offline. Model weights and all videos are ignored by Git.
Only load model files from sources you trust. `device = "auto"` selects CUDA
when available and otherwise uses CPU; explicit `--device 0` fails if CUDA is
unavailable. Runtime GPU errors are reported rather than silently changing devices.

Each output directory contains:

- `annotated.mp4`: boxes, confidence, temporary IDs, and FPS overlay (without audio).
- `tracks.jsonl`: per-frame person boxes, IDs, and video timestamps.
- `summary.json`: actual model device, versions, timing, stop reason, and a hash
  of tracking records for comparing repeated runs.

Press **Q** or **Escape** in the preview to finish early, or **Ctrl+C** in the
terminal to interrupt. Existing output directories are never overwritten.
Use constant frame rate footage. Camera input is not implemented yet.

See [development and short validation steps](docs/development.md) for the data
flow, measurement definitions, and current environment findings.

## Limitations and data

Counts can be affected by lighting, camera angle, overlapping objects, and lost tracks. Entry and exit counts do not guarantee an exact room occupancy figure. Accuracy and speed will be measured rather than assumed.

Local processing is a core design goal. Keep camera credentials and private footage out of the repository, and only share recordings you have permission to publish.

## Contributing

Suggestions and focused issues are welcome. Please discuss larger changes in an issue before starting work. See the [development guide](docs/development.md).

## License

ZoneLens is licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](LICENSE) for the full terms.

Third-party libraries, model weights, and datasets remain subject to their own licenses.
