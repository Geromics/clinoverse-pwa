# Build the static PWA, then serve it with Caddy on port 80.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=
ARG VITE_BASE=/
ENV VITE_API_URL=$VITE_API_URL VITE_BASE=$VITE_BASE
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
