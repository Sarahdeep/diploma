# filepath: d:\diploma\frontend\Dockerfile
FROM node:23-slim

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
# Add a cache-busting argument like a build date or a random number passed as an ARG
# For simplicity, we'll add a static comment that we can change if needed again.
RUN npm install --legacy-peer-deps # Cache buster: 1

# Copy the rest of the application
COPY . .

EXPOSE 3000
CMD [ "npm", "run", "build" ]