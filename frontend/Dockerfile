# filepath: d:\diploma\frontend\Dockerfile
FROM node:23-slim

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available) for better caching
COPY package.json package-lock.json* ./

# Set NODE_ENV to development to ensure devDependencies (like Vite) are installed
ENV NODE_ENV=development

# Install dependencies
# Add a cache-busting argument like a build date or a random number passed as an ARG
# For simplicity, we'll add a static comment that we can change if needed again.
RUN npm install --legacy-peer-deps # Cache buster: 1

# Copy the rest of the application
COPY . .

EXPOSE 3000
CMD [ "npm", "run", "build" ]