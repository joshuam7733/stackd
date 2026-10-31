# STACKD server image. Mount a volume at /app/data so the SQLite database survives restarts.
#   docker build -t stackd .
#   docker run -p 5173:5173 -v stackd-data:/app/data -e PUBLIC_URL=http://localhost:5173 stackd
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173 DATABASE_URL=sqlite:/app/data/stackd.db
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY index.html ./
COPY assets ./assets
COPY src ./src
COPY server ./server
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 5173
CMD ["node", "server/main.js"]
