# Use official Node.js image
FROM node:18-alpine

# Create working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if you have one)
COPY package.json ./

# Install dependencies with npm
RUN npm install --production

# Copy source code
COPY src ./src

# Expose port and set environment
EXPOSE 5000
ENV NODE_ENV=production

# Start the server
CMD ["node", "src/index.js"]
