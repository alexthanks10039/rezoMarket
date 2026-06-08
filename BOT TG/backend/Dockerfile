FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

COPY src ./src

CMD ["node", "src/index.js"]
