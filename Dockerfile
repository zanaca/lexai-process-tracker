FROM node:18-bullseye AS base
    EXPOSE $PORT
    ENV APPDIR /usr/sequoai
    WORKDIR $APPDIR
    RUN apt-get update && apt-get install -y curl
    RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -; echo "deb http://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
    ADD requirements.apt /tmp/requirements.apt
    RUN apt-get update && apt-get -y install $(cat /tmp/requirements.apt)
    RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
    RUN useradd -ms /bin/sh -d $APPDIR sequoai
    RUN ln -sf /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime


FROM base AS development
    ENV NODE_ENV developent
    ENV PORT 80
    ENTRYPOINT ["/usr/sequoai/Dockerfile_entrypoint.sh"]


FROM base AS release
    ENV NODE_ENV production

    COPY --chown=sequoai . $APPDIR
    RUN chown -R sequoai: $APPDIR
    RUN echo release > /docker_target
    # Not running process with root (hardening)
    USER sequoai

    RUN yarn

    CMD ["node", "src/server.js"]

FROM release AS workerQueue
    USER root
    RUN echo workerQueue > /docker_target
    USER sequoai

    CMD ["node", "src/worker/populateQueue.js"]
