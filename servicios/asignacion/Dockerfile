# Contexto de build = raiz del repo (para copiar comun/).
FROM node:20-alpine
WORKDIR /app

# 1) Dependencias (capa cacheada mientras no cambien los package.json)
COPY comun/package.json comun/
RUN cd comun && npm install --omit=dev --no-audit --no-fund
COPY servicios/asignacion/package.json servicios/asignacion/
RUN cd servicios/asignacion && npm install --omit=dev --no-audit --no-fund

# 2) Codigo
COPY comun/ comun/
COPY servicios/asignacion/ servicios/asignacion/

WORKDIR /app/servicios/asignacion
ENV NODE_ENV=production PORT=3004
EXPOSE 3004
USER node
CMD ["node", "src/index.js"]
