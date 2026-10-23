# Use official Node 22 LTS image
FROM node:22-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Bundle app source
COPY . .

# Cloud Run listens on PORT
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the app
CMD ["npm", "start"]
