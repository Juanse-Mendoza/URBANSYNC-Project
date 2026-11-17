# Contexto de build = raiz del repo (para copiar comun/).
FROM node:20-alpine
WORKDIR /app

COPY comun/package.json comun/
RUN cd comun && npm install --omit=dev --no-audit --no-fund
COPY gateway/package.json gateway/
RUN cd gateway && npm install --omit=dev --no-audit --no-fund

COPY comun/ comun/
COPY gateway/ gateway/

WORKDIR /app/gateway
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/index.js"]
