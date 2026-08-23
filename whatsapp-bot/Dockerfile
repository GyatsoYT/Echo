FROM node:20-slim

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm install --omit=dev

# Copy bot source code
COPY . .

# Ensure persistent session directories exist
RUN mkdir -p /data/auth_session auth_session

CMD ["node", "bot.js"]
