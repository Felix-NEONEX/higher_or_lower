FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY client ./client
COPY data ./data
COPY scripts ./scripts
COPY server ./server
COPY shared ./shared
COPY tsconfig.json tsconfig.server.json ./

RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data

EXPOSE 3000

CMD ["npm", "run", "start"]
