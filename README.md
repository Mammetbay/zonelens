# ZoneLens

Local-first video analytics for IP cameras, webcams, and video files.

ZoneLens is an open-source project for detecting and tracking objects, counting line crossings, and monitoring user-defined zones. The goal is to build a practical computer vision application that runs on your own computer.

> **Status: early development.** This repository currently contains project documentation and a license. The features below are planned, and there is no runnable application yet.

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

## Planned stack

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

There are no installation or run commands yet. They will be added with the first working prototype. Video-file support will make it possible to try ZoneLens without an IP camera.

## Limitations and data

Counts can be affected by lighting, camera angle, overlapping objects, and lost tracks. Entry and exit counts do not guarantee an exact room occupancy figure. Accuracy and speed will be measured rather than assumed.

Local processing is a core design goal. Keep camera credentials and private footage out of the repository, and only share recordings you have permission to publish.

## Contributing

Suggestions and focused issues are welcome. Please discuss larger changes in an issue before starting work. A development guide will be added as the implementation takes shape.

## License

ZoneLens is licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](LICENSE) for the full terms.

Third-party libraries, model weights, and datasets remain subject to their own licenses.
