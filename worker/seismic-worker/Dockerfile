# Seismic worker image (QI programme Q0). Node 24 LTS pinned by digest. The
# image carries one esbuild bundle (built by deploy.sh from the commit being
# deployed: worker + vendored engines + Seismolord's import services), so the
# code in the container is exactly that commit's code.
FROM node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

ENV NODE_ENV=production
WORKDIR /app
COPY bundle ./dist
ARG ENGINE_COMMIT=unknown
ENV ENGINE_COMMIT=${ENGINE_COMMIT}
RUN node -e "if(!process.version.startsWith('v24.'))process.exit(1)" \
 && mkdir -p /scratch && chown node:node /scratch
USER node
CMD ["node", "--enable-source-maps", "dist/main.mjs"]
