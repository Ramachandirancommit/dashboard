FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY shared ./shared
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY jobs/requirements.txt ./jobs/requirements.txt
RUN python3 -m venv /opt/dashboard-venv \
    && /opt/dashboard-venv/bin/pip install --no-cache-dir -r jobs/requirements.txt
ENV PATH="/opt/dashboard-venv/bin:${PATH}" NODE_ENV=production PYTHONDONTWRITEBYTECODE=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY jobs ./jobs
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
