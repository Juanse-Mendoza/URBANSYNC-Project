# Contexto de build = raiz del repo (para copiar comun/).
FROM node:20-alpine
WORKDIR /app

# 1) Dependencias (capa cacheada mientras no cambien los package.json)
COPY comun/package.json comun/
RUN cd comun && npm install --omit=dev --no-audit --no-fund
COPY servicios/clasificacion/package.json servicios/clasificacion/
RUN cd servicios/clasificacion && npm install --omit=dev --no-audit --no-fund

# 2) Codigo
COPY comun/ comun/
COPY servicios/clasificacion/ servicios/clasificacion/

WORKDIR /app/servicios/clasificacion
ENV NODE_ENV=production PORT=3002
EXPOSE 3002
USER node
CMD ["node", "src/index.js"]
