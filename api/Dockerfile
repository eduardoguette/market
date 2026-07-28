# Market API — Express (MVC) + SQLite, sin dependencias externas.
FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 8080
CMD ["node", "src/server.js"]
