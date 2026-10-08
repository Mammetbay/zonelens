# ZoneLens

Local-first video analytics for IP cameras, webcams, and video files.

ZoneLens is an open-source project for detecting and tracking objects, counting line crossings, and monitoring user-defined zones. The goal is to build a practical computer vision application that runs on your own computer.

> **Status: working video-file prototype with line counting.** YOLO11n person detection and ByteTrack tracking have been exercised on a real clip, including CUDA inference on Windows. Optional bidirectional line counting records crossing events and draws counts on the output video. Manual count validation, zones, camera input, and the web interface are still pending. See [implementation status](docs/roadmap.md).

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
| Backend (planned) | FastAPI |
| Frontend (planned) | React, TypeScript, Vite |
| Event storage (planned) | SQLite |
| Live updates (planned) | WebSocket |

The initial development target is Windows 11. The prototype uses a small pretrained model without fine-tuning. Initial measurements and their limitations are recorded in the [development guide](docs/development.md).

## Roadmap

- [x] **First prototype:** detect and track people in a video file.
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
.\.venv\Scripts\python.exe -m pip install "torch==2.14.0+cu130" "torchvision==0.29.1+cu130" --index-url https://download.pytorch.org/whl/cu130
.\.venv\Scripts\python.exe -m pip install -e ".[dev]" --index-url https://pypi.org/simple
```

The project targets CUDA **13.0** (`cu130`). The package pair above was used
for local validation with Python 3.14 and an NVIDIA GeForce RTX 5060 Ti.
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

Both **torch and torchvision** need CUDA builds. If inference fails with
`torchvision::nms` unavailable for CUDA, check `torchvision.__version__`: a
`+cpu` build cannot perform the GPU operation, even when PyTorch detects the GPU.
Install the CUDA pair above using the same Python interpreter as ZoneLens.

To verify that operation directly:

```powershell
.\.venv\Scripts\python.exe -c "import torch, torchvision; b=torch.tensor([[0.,0.,10.,10.]],device='cuda'); s=torch.tensor([0.9],device='cuda'); print(torchvision.ops.nms(b,s,0.5))"
```

Expected result: `tensor([0], device='cuda:0')`.

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
- `events.jsonl`: line crossing events (empty when counting is disabled).
- `summary.json`: actual model device, versions, timing, stop reason, and a hash
  of tracking records for comparing repeated runs.

Press **Q** or **Escape** in the preview to finish early, or **Ctrl+C** in the
terminal to interrupt. Existing output directories are never overwritten.
Use constant frame rate footage. Camera input is not implemented yet.

## Line counting

Set the line endpoints in `configs/line.toml` to match your footage, then run:

```powershell
.\.venv\Scripts\zonelens.exe samples/people.mp4 --config configs/line.toml --device 0 --show --output outputs/line-run1
```

Coordinates are normalized `[x, y]` values between 0 and 1: `[0, 0]` is the
top-left corner and `[1, 1]` the bottom-right corner. Only the segment between
`start` and `end` counts; its extension does not. The arrow shows endpoint order.
The sample left-to-right horizontal line counts downward crossings as `in` and
upward crossings as `out`. These labels are configurable, and reversing the
endpoints reverses the directions. Set labels to match the camera's actual layout.

Counting follows each tracked person's box bottom-center point. A side change
beyond `hysteresis_px` produces one event; small movements inside the band do
not repeatedly count. A person can cross back and be counted in the other
direction. Tracks unseen for more than `max_gap_frames` restart without a
crossing; shorter gaps can bridge a crossing. New IDs also start fresh.

`events.jsonl` records the track ID, direction, confirmation frame, video time
in milliseconds, and bottom-center point in pixels. Confirmation can be later
than the physical crossing because of the band. Totals appear on the video and
in `summary.json` under `line_counts`. Omitting `[line]` disables counting.
Counts depend on tracking continuity; ID switches and occlusion can miss or
duplicate crossings. Compare a full run with a manual count before relying on it.

## Understanding your results

OpenCV decodes each video frame, YOLO finds person boxes, and ByteTrack matches
detections across frames to assign temporary IDs. This runs a pretrained model;
it does not train a new model or recognize anyone's identity.

| Result | Meaning |
| --- | --- |
| Box, ID, confidence | A detected region, a temporary track label, and a model score (not measured accuracy). |
| `device` / `gpu` | The active predictor device and its GPU name; CPU runs report `gpu: null`. |
| `frames` / `source_fps` | Number of frames processed and the source video's playback rate. |
| `processing_fps` | Throughput including decoding, tracking, drawing, writing, and any preview; excludes setup. |
| `tracked_frames` | Frames with at least one assigned track ID, not frames where every person was found. |
| `unique_track_ids` | Different track labels assigned, not the number of distinct people. |
| `stop_reason` | `end_of_file` for completion, `frame_limit` or `user_stop` for intentional early stops. |
| `tracks_sha256` | Fingerprint of tracking records for repeat comparisons; matching values do not establish accuracy. |

Start with 10–30 seconds of clear walking footage, preferably a fixed camera,
720p/1080p, and constant 25/30 FPS. Inspect missed people, false boxes, and ID
changes when people overlap or leave/re-enter the frame. Keep the source and
license in your notes; see [sample guidance](samples/README.md).

Older local summaries may report `device: cpu` even when CUDA was requested:
the original implementation inspected the source model instead of the active
predictor's copy. New runs report the predictor device; old output files are not
rewritten. Re-run into a new output directory to obtain a corrected summary.

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
