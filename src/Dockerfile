FROM alpine AS package-slim

RUN apk add --update --no-cache jq

COPY package.json /tmp
RUN jq '{ dependencies, devDependencies }' < /tmp/package.json > /tmp/package-slim.json

# Using ARG in FROM will always override this, and we also need to build node-16
FROM node:16.17.0-bullseye-slim AS build

WORKDIR /app

COPY --from=package-slim /tmp/package-slim.json ./package.json
COPY package-lock.json ./
RUN npm install --frozen-lockfile

COPY . .
RUN npm run build

RUN apt-get -y update && apt-get -y upgrade && apt-get install -y ffmpeg

EXPOSE 3000
ENTRYPOINT [ "yarn", "start:prod" ]