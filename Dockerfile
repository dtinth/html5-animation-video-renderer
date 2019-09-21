FROM node:12

# https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#running-puppeteer-in-docker
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-unstable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser && mkdir -p /home/pptruser/Downloads && chown -R pptruser:pptruser /home/pptruser
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY yarn.lock /usr/src/app/
COPY package.json /usr/src/app/
RUN yarn install --frozen-lockfile
RUN chown -R pptruser:pptruser /usr/src/app
USER pptruser
COPY render.js /usr/src/app/
CMD ["bash", "-c", "node render.js server"]