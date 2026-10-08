
# first 30 frame GPU and model is working?
.\.venv\Scripts\zonelens.exe samples\people.mp4 --config configs\video.toml --device 0 --max-frames 30 --output outputs\smoke1

# Run for full video
.\.venv\Scripts\zonelens.exe samples\people.mp4 --config configs\video.toml --device 0 --show --output outputs\full1

# Zone occupancy and dwell alerts (edit the polygon in configs/zones.toml)
.\.venv\Scripts\zonelens.exe samples\people.mp4 --config configs\zones.toml --device 0 --show --output outputs\zones-run1
# Line crossing counts

Edit `[line]` in `configs/line.toml` to position the counting segment. Coordinates
are normalized `[x, y]` pairs. A left-to-right horizontal line counts downward
as `in` and upward as `out`; reversing endpoints reverses directions.

```powershell
.\.venv\Scripts\zonelens.exe samples/people.mp4 --config configs/line.toml --device 0 --show --output outputs/line-run1
```

Use a new output directory for each run. Inspect `annotated.mp4`, crossing events
in `events.jsonl`, and `line_counts` in `summary.json`. Compare crossings with a
manual count before treating totals as measured accuracy.
