#=====================================================#
#================[ DEPENDENCIES STAGE ]===============#
#=====================================================#

FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package*.json ./

RUN npm ci

#=====================================================#
#===================[ BUILD STAGE ]===================#
#=====================================================#

FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules

COPY . .

ENV MONGODB_URI=mongodb://localhost:27017/build

RUN npm run build

#=====================================================#
#==================[ RUNNER STAGE ]===================#
#=====================================================#

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/.next/standalone ./

COPY --from=builder /app/.next/static ./.next/static

COPY --from=builder /app/public ./public

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
