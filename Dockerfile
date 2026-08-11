FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build:spa

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 10000
CMD ["/bin/sh", "-c", "sed -i \"s/listen 10000;/listen ${PORT:-10000};/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
