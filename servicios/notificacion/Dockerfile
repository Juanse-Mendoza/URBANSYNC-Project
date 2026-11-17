# Contexto de build = raiz del repo (para copiar comun/).
FROM node:20-alpine
WORKDIR /app

# 1) Dependencias (capa cacheada mientras no cambien los package.json)
COPY comun/package.json comun/
RUN cd comun && npm install --omit=dev --no-audit --no-fund
COPY servicios/notificacion/package.json servicios/notificacion/
RUN cd servicios/notificacion && npm install --omit=dev --no-audit --no-fund

# 2) Codigo
COPY comun/ comun/
COPY servicios/notificacion/ servicios/notificacion/

WORKDIR /app/servicios/notificacion
ENV NODE_ENV=production PORT=3005
EXPOSE 3005
USER node
CMD ["node", "src/index.js"]
