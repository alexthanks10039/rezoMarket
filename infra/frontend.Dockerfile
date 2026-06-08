FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

COPY index.html script.js styles.css ./
COPY src ./src

EXPOSE 80

