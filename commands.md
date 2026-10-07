
# first 30 frame GPU and model is working?
.\.venv\Scripts\zonelens.exe samples\people.mp4 --config configs\video.toml --device 0 --max-frames 30 --output outputs\smoke1

# Run for full video
.\.venv\Scripts\zonelens.exe samples\people.mp4 --config configs\video.toml --device 0 --show --output outputs\full1