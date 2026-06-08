FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY src/seed ./src/seed

RUN mkdir -p /app/static/assets /app/static/email

EXPOSE 3002 3003

CMD ["node", "dist/index.js"]

