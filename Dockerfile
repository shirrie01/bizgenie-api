# Use official Node 22 LTS image
FROM node:22-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

# Create app directory
WORKDIR /app

# Media-inspection toolchain (ffmpeg/ffprobe, bubblewrap, prlimit) at the reviewed, pinned versions.
# Veo output validation and customer-upload inspection cannot run without it; the build fails if the pins cannot be installed or verified.
COPY runtime/video-inspection-toolchain.v1.json scripts/install-media-toolchain.sh ./toolchain-install/
RUN sh ./toolchain-install/install-media-toolchain.sh ./toolchain-install/video-inspection-toolchain.v1.json \
 && rm -rf ./toolchain-install

# Install app dependencies
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Bundle app source
COPY . .

# Cloud Run listens on PORT
ENV PORT=8080

# Expose port
EXPOSE 8080

# Least privilege: the API and worker never need root. Media inspection runs inside bubblewrap (no network, read-only input, 1 MiB tmpfs)
# under prlimit (see src/media/inspectionLimits.js) and the service refuses to enable video/uploads if that isolation cannot be established.
USER node

# Start the app
CMD ["npm", "start"]
