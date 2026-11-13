#!/bin/sh
# Installs the media-inspection toolchain at EXACTLY the versions in the reviewed toolchain file, and refuses to continue if it cannot (BG-LAUNCH-004). Used by the Dockerfile.
# When Debian publishes a security update the pinned version leaves the archive and the build fails here on purpose: review the new versions, update
# runtime/video-inspection-toolchain.v1.json, and rebuild. A silent drift of the tools that parse customer files is the thing being prevented.
set -eu
FILE="${1:?path to video-inspection-toolchain.v1.json}"
field() { node -p "const v=require('$(realpath "$FILE")')['$1']; if(typeof v!=='string'||!v) process.exit(3); v"; }
FFMPEG_PKG="$(field ffmpeg_package)"; BWRAP_PKG="$(field bubblewrap_package)"; FFPROBE_VER="$(field ffprobe_version)"
echo "pinned: ffmpeg=$FFMPEG_PKG bubblewrap=$BWRAP_PKG ffprobe=$FFPROBE_VER"
apt-get update
if ! apt-get install -y --no-install-recommends "ffmpeg=$FFMPEG_PKG" "bubblewrap=$BWRAP_PKG"; then
  echo "ERROR: the pinned media toolchain versions are not installable from this base image's archive." >&2
  apt-cache policy ffmpeg bubblewrap >&2 || true
  echo "Review the available versions, update $FILE, and rebuild." >&2
  exit 1
fi
for pkg in "ffmpeg:$FFMPEG_PKG" "bubblewrap:$BWRAP_PKG"; do
  name="${pkg%%:*}"; want="${pkg#*:}"; got="$(dpkg-query -W -f='${Version}' "$name")"
  [ "$got" = "$want" ] || { echo "ERROR: $name is $got, expected $want" >&2; exit 1; }
done
ffprobe -version | head -n1 | grep -F "ffprobe version $FFPROBE_VER" >/dev/null || { echo "ERROR: ffprobe does not report $FFPROBE_VER: $(ffprobe -version | head -n1)" >&2; exit 1; }
for tool in ffmpeg ffprobe bwrap prlimit; do command -v "$tool" >/dev/null || { echo "ERROR: $tool missing" >&2; exit 1; }; done
rm -rf /var/lib/apt/lists/*
echo "media toolchain verified"
