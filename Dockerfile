FROM node:20-bookworm-slim

WORKDIR /app

# Install build dependencies for better-sqlite3 if needed
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --only=production || npm install --production

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
