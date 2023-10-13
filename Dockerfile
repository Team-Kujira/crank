FROM node:19

ENV TERM=xterm
RUN mkdir /usr/src/app
WORKDIR /usr/src/app

COPY package*.json ./
RUN yarn install

#COPY .eslintrc ./
COPY tsconfig.json ./
COPY src ./src

#RUN yarn build

CMD ["yarn", "start"]
