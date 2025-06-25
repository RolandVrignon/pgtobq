# Use official Node.js image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies (including dev dependencies for building)
COPY package*.json ./
RUN npm ci

# Bundle app source
COPY . .

# Compile TypeScript
RUN npx tsc

# Remove dev dependencies and source files to reduce image size
RUN rm -rf src/ tsconfig.json && npm prune --production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001

# Change ownership of the app directory to nodeuser
RUN chown -R nodeuser:nodejs /usr/src/app

USER nodeuser

# Run the app
CMD ["node", "dist/index.js"]