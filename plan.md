# ZoneLens — Open-Source Computer Vision Project Plan

Date: October 3, 2026  
Status: Implementation in progress.  
Project Name: ZoneLens  
Primary Development Environment: Windows 11, NVIDIA RTX 5060 Ti 16 GB VRAM, 32 GB RAM.  

---

## 1. Objectives & Success Criteria

ZoneLens is an open-source, local-first web application that analyzes human and vehicular movement across user-defined counting lines and polygonal zones in real-time camera streams and video files.

Two primary goals:
1. **Hands-on Mastery of Computer Vision**: Frame capture, pretrained object detection, tracking, normalized coordinates, rule engines, performance profiling, and empirical validation.
2. **Production-Grade Open Source Portfolio**: Delivering a documented, measurable engineering project that anyone can clone, run, and evaluate locally.

Success is not merely drawing bounding boxes. It requires a responsive user interface, robust counting heuristics, automatic reconnection across network interruptions, reproducible demonstrations, and honest, transparent benchmark reporting.

---

## 2. Use Cases & Versions

| Version | Environment | Scope |
| --- | --- | --- |
| **v0.1** | Room & Doorway | Video / live source, person detection, tracking IDs, bidirectional line crossing counting |
| **v0.2** | Room / Campus Area | Polygon zone drawing, visible occupancy counts, dwell time tracking, event history |
| **v0.3** | Parking Lot | Vehicle detection and interactive parking space occupancy analysis |
| **v1.0** | General Release | Hardening, sample demos, reproducible installation, benchmarks, contribution guide |

The primary initial target is doorway crossing counting. Manual verification is straightforward and exposes real-world challenges such as U-turns, doorway lingering, side-by-side crossings, and temporary occlusions.

### Concepts and Boundaries
- **Detection**: Locating persons or vehicles in a single frame.
- **Tracking**: Associating detections across consecutive frames with temporary IDs.
- **Event Logic**: Deriving line crossings, zone entries, exits, and dwell thresholds from tracked trajectories.
- **Tracking IDs**: Temporary operational labels, not biometric identities. IDs may change upon leaving view, heavy occlusion, or stream dropouts.
- **Zone Occupancy**: Represents only individuals visible to the camera and detected by the model.
- **Entries minus Exits**: An approximation of occupancy, not an absolute ground truth count. Initial counts and missed detections affect running totals.
- **Dwell Time**: Measured solely within the observed continuous tracking session.

---

## 3. Hardware & Camera Specifications

Documented camera: Hikvision EXIR Fixed Mini Bullet H.265+ (DS-2CD1021G0-I).

- 2 MP resolution (up to 1920 × 1080).
- Main stream: H.265+ / H.265 / H.264+ / H.264; Sub-stream: H.265 / H.264.
- RTSP support over wired RJ45 Ethernet.
- 12 V DC power or IEEE 802.3af PoE.

### Power & Networking Options
| Option | Requirements | Use Case |
| --- | --- | --- |
| **DC Adapter** | 12 V adapter meeting polarity/current rating, Ethernet cable | Desktop bench testing near a power outlet |
| **PoE Injector** | 802.3af compliant injector and power supply, two Ethernet cables | Single cable to camera; portable field setup |
| **PoE Switch** | Switch with 802.3af ports and appropriate cabling | Multi-camera or existing infrastructure |

Camera and computer operate within the same local network subnet. No external internet routing or port forwarding is required for local inference.

---

## 4. Hardware-Agnostic Start (Files, Webcams & Mobile Streams)

Development does not block on external camera equipment:
1. **Pre-recorded Footage**: Work with redistributable sample videos for deterministic testing.
2. **DirectShow / Webcams**: Exercise real-time video capture using USB webcams or virtual webcams (DroidCam, Iriun).
3. **Mobile Wi-Fi Streams**: Connect smartphone cameras via IP Webcam (`:8080`) or DroidCam (`:4747`).
4. **Physical IP Cameras**: Connect RTSP streams to the unified ingestion pipeline.

The vision engine provides a universal capture abstraction across recorded video files, DirectShow webcams, and network streams (HTTP/RTSP).

---

## 5. Technology Stack

| Layer | Selection | Rationale |
| --- | --- | --- |
| **Vision Engine** | Python + OpenCV | Universal frame ingestion, matrix math, coordinate normalization |
| **Inference** | PyTorch + Ultralytics YOLO11n | Fast, pretrained object detection on CPU and CUDA GPUs |
| **Tracking** | ByteTrack | Associates detections across frames with low computational overhead |
| **API Server** | FastAPI + Pydantic | High-performance asynchronous API, SSE/WebSocket telemetry |
| **Frontend** | React 19 + TypeScript + Vite | Interactive live canvas, line/zone editor, telemetry metrics |
| **Data Storage** | SQLite | Serverless, local-first event and rule persistence |
| **Streaming** | Multipart MJPEG | Low-latency local preview without browser codec hurdles |
| **Testing** | pytest + Vitest | Rigorous geometry, tracking, and API integration coverage |
| **Package Management** | Python venv + npm | Simple, reproducible local development on Windows and Linux |

---

## 6. Architecture & Data Flow

```
[Video / Webcam / RTSP] ➔ [Source Adapter]
                             │
                             ▼
                     [YOLO11n Detector]
                             │
                             ▼
                    [ByteTrack Tracker]
                             │
                             ▼
                     [Rule Engine] ➔ [SQLite Event Store]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   [MJPEG Video Stream]              [SSE / WebSocket Telemetry]
            │                                 │
            └────────────────┬────────────────┘
                             ▼
               [React Interactive Dashboard]
```

1. **Source Adapter**: Decodes frames and manages reconnection with exponential backoff on stream drops.
2. **Detector**: Extracts bounding boxes, classes, and confidence scores.
3. **Tracker**: Matches current detections to existing tracklets via ByteTrack.
4. **Rule Engine**: Evaluates crossing vectors against normalized lines and point-in-polygon tests for zones.
5. **Event Store**: Commits crossing events, zone transitions, and dwell threshold triggers to SQLite.
6. **Streaming & Telemetry**: Delivers annotated video via MJPEG and telemetry/events via SSE & WebSockets.
7. **Frontend Dashboard**: Lets operators draw lines/zones in real time, inspect live statistics, and query historical events.

---

## 7. Rule Engine Mechanics

### Line Crossing
- Defined by a directional segment with endpoints `start` and `end` in normalized coordinates `[0, 1]`.
- Track anchor: bottom-center of the detected bounding box (`[ (x1+x2)/2, y2 ]`).
- Uses cross-product signed distances and a configurable pixel deadband (`hysteresis_px`) to reject jitter.
- Enforces segment bounding-box tests to ensure tracks cross between endpoints, not along infinite ray projections.
- Emits bidirectional crossing events (`positive_label` A➔B vs `negative_label` B➔A).

### Polygon Zones & Dwell Alerts
- Defined by 3 or more vertices in normalized coordinates `[0, 1]`.
- Evaluated via ray casting algorithm (`cv2.pointPolygonTest`).
- Computes real-time occupancy counts and tracks per-visitor dwell durations.
- Fires a single dwell alert event when a visitor continuously occupies a zone longer than `dwell_seconds`.
- Gracefully handles brief tracking losses (`max_gap_frames`) to avoid duplicate entry/exit triggers.

---

## 8. Milestone Roadmap

- [x] **M0: Environment & Core Pipeline**: Virtual environment, CUDA GPU validation, CLI inference, graceful shutdown.
- [x] **M1: Detection & Tracking**: YOLO11n person detection, ByteTrack tracking, performance metrics (FPS, inference ms).
- [x] **M2: Line Crossing Engine**: Bidirectional line crossing, hysteresis deadband, event generation.
- [x] **M3: Zone Analytics & Web UI**: React dashboard, canvas geometry editor, SQLite persistence, SSE & WebSocket telemetry.
- [x] **M4: Universal Camera Support**: DirectShow webcams, phone streams (IP Webcam, DroidCam), RTSP streams, auto-reconnection.
- [ ] **M5: Parking Space Monitoring (v0.3)**: Vehicle detection and static slot occupancy analysis.
- [ ] **M6: Benchmarking & v1.0 Release**: Documentation, reproducible setup benchmarks, sample media packaging.

---

## 9. Data & Privacy Principles

- Operates 100% locally on user hardware; no video or telemetry leaves the machine.
- Temporary tracking IDs are discarded upon session termination.
- Sensitive credentials (e.g. RTSP passwords) are redacted from logs and telemetry endpoints.
- Pre-recorded demonstration assets require documented licenses or explicit distribution rights.
