# Contexto de build = raiz del repo (para copiar comun/).
FROM node:20-alpine
WORKDIR /app

# 1) Dependencias (capa cacheada mientras no cambien los package.json)
COPY comun/package.json comun/
RUN cd comun && npm install --omit=dev --no-audit --no-fund
COPY servicios/usuario/package.json servicios/usuario/
RUN cd servicios/usuario && npm install --omit=dev --no-audit --no-fund

# 2) Codigo
COPY comun/ comun/
COPY servicios/usuario/ servicios/usuario/

WORKDIR /app/servicios/usuario
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node
CMD ["node", "src/index.js"]
