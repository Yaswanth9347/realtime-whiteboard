# Build stage
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Copy package files
COPY package.json ./

# Install dependencies and build
RUN npm install
COPY public ./public
COPY src ./src
RUN npm run build

# Production stage
FROM nginx:stable-alpine
COPY --from=builder /usr/src/app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
