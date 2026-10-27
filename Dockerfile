# Dependency refresh and Node base image bump tracked under
# pc-dev-issues#427. See that issue for the version history.

FROM node:24-bookworm-slim

# ssh for npm git deps; ca-certificates for HTTPS upstreams. The original
# Dockerfile installed imagemagick/ghostscript/libmysqlclient — none of the
# app deps use them (the service is JSON-in, queue, HTTP-out, no DB).
RUN apt-get update && apt-get -y install --no-install-recommends \
    ssh ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV="production"

# Copy app's source code to the /app directory
COPY ./app /home/node/app

# The application's directory will be the working directory
WORKDIR /home/node/app

# Install exactly what's in package-lock.json, instead of letting npm
# install resolve newer versions at build time.
RUN npm ci --omit=dev

# EXPOSE 4001

USER node

# Exec form so node receives SIGTERM directly instead of a shell
# swallowing it; pods stop in about 1s instead of waiting out the full
# grace period. Kubernetes restarts crashed containers, and logs still
# reach kubectl logs through stdout/stderr, so forever is no longer needed.
CMD ["node", "app.js"]