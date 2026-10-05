# Seismic worker image (QI programme Q0). Node 24 LTS pinned by digest; the
# build context is the repo root so packages/engines can be shipped with the
# worker (later handlers import the same vendored engines as the browser).
FROM node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

ENV NODE_ENV=production
WORKDIR /app
COPY worker/seismic-worker/package.json ./package.json
COPY worker/seismic-worker/src ./src
COPY packages/engines /packages/engines
ARG ENGINE_COMMIT=unknown
ENV ENGINE_COMMIT=${ENGINE_COMMIT}
RUN node -e "if(!process.version.startsWith('v24.'))process.exit(1)" \
 && mkdir -p /scratch && chown node:node /scratch
USER node
CMD ["node", "src/main.js"]
