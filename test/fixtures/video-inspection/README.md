# Synthetic inspection fixtures

Locally generated on 2026-10-23 with FFmpeg 7.1.5-0+deb13u1/libx264. Blue frames and an optional 440 Hz sine wave contain no customer content, personal data or provider output. No paid calls. Fixtures are deliberately tiny; they do not prove general Instagram compliance or all H.264 profiles.

Reproduction commands (from repository root, with trusted local ffmpeg):

```sh
ffmpeg -v error -f lavfi -i color=c=blue:s=1280x720:r=24 -t 4 -an -c:v libx264 -preset ultrafast -pix_fmt yuv420p -movflags +faststart -y test/fixtures/video-inspection/silent-h264.mp4
ffmpeg -v error -f lavfi -i color=c=blue:s=1280x720:r=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 4 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -movflags +faststart -y test/fixtures/video-inspection/audio-h264.mp4
ffmpeg -v error -f lavfi -i color=c=blue:s=320x240:r=24 -t 2 -an -c:v mpeg4 -movflags +faststart -y test/fixtures/video-inspection/mpeg4.mp4
ffmpeg -v error -display_rotation 90 -i test/fixtures/video-inspection/silent-h264.mp4 -c copy -y test/fixtures/video-inspection/rotated-h264.mp4
```

Generated file bytes can vary with encoder versions/builds. Tests check independently measured stream properties and a digest of the actual input, not encoder-specific byte equality. `silent-h264.mp4` is the browser decode/playback fixture; its current SHA-256 is `754b4da354d6852cc1eda4565514a9f6b57894f6f7f29246f5b0b59512811bb2`.
