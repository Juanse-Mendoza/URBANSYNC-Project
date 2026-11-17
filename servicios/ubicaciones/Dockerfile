# Contexto de build = raiz del repo (para copiar comun/).
FROM node:20-alpine
WORKDIR /app

# 1) Dependencias (capa cacheada mientras no cambien los package.json)
COPY comun/package.json comun/
RUN cd comun && npm install --omit=dev --no-audit --no-fund
COPY servicios/ubicaciones/package.json servicios/ubicaciones/
RUN cd servicios/ubicaciones && npm install --omit=dev --no-audit --no-fund

# 2) Codigo
COPY comun/ comun/
COPY servicios/ubicaciones/ servicios/ubicaciones/

WORKDIR /app/servicios/ubicaciones
ENV NODE_ENV=production PORT=3003
EXPOSE 3003
USER node
CMD ["node", "src/index.js"]
