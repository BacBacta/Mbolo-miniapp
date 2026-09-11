# Image de l'application. Utilisée par Fly, et par tout hébergeur qui accepte Docker.
FROM node:22-alpine

# su-exec sert à abandonner les droits root après avoir préparé le volume de données
RUN apk add --no-cache su-exec

ENV NODE_ENV=production
WORKDIR /app

# Les dépendances d'abord : cette couche est réutilisée tant que le verrou ne change pas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public

# Les données (base JSON et photos) vivent sur un volume monté, jamais dans l'image
ENV DATA_DIR=/data
ENV PORT=8080
EXPOSE 8080

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
