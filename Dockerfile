FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs library.mjs openapi.json ./
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]
