FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 10000

CMD ["npx", "tsx", "services/odysseus-worker/src/server.ts"]
