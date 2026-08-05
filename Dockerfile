# Use official Node 22 LTS image
FROM node:22-slim

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Cloud Run listens on PORT
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start the app
CMD ["npm", "start"]
