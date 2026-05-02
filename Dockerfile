FROM python:3.10-slim

RUN apt-get update && apt-get install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get install -y nodejs

WORKDIR /app
COPY . .

RUN pip install -r requirements.txt
RUN npm install

EXPOSE 3000
CMD ["node", "server-simple-deploy.js"]