# Dependency refresh and Node base image bump tracked under
# pc-dev-issues#427. See that issue for the version history.

FROM node:20-bookworm-slim

# ssh for npm git deps; ca-certificates for HTTPS upstreams. The original
# Dockerfile installed imagemagick/ghostscript/libmysqlclient — none of the
# app deps use them (the service is JSON-in, queue, HTTP-out, no DB).
RUN apt-get update && apt-get -y install --no-install-recommends \
    ssh ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# https://github.com/nodejs/docker-node/issues/479#issuecomment-319446283
# and https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#global-npm-dependencies
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
# optionally if you want to run npm global bin without specifying path
ENV PATH=$PATH:/home/node/.npm-global/bin
ENV NODE_ENV="production"

RUN npm install -g forever

# Copy app's source code to the /app directory
COPY ./app /home/node/app

# The application's directory will be the working directory
WORKDIR /home/node/app

# Install exactly what's in package-lock.json, instead of letting npm
# install resolve newer versions at build time.
RUN npm ci --omit=dev

# EXPOSE 4001

RUN chown -R node:node ./logs

USER node

# Start the application
CMD forever -l ./logs/server.log -o ./logs/out.log -e ./logs/err.log app.js