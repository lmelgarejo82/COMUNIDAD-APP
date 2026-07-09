FROM node:22-alpine

RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

RUN chmod +x entrypoint.sh

CMD ["./entrypoint.sh"]
