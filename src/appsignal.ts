import Appsignal from "@appsignal/javascript"; // For ES Module

export const appsignal = new Appsignal.default({
  key: process.env.APPSIGNAL,
  revision: process.env.RENDER_GIT_COMMIT,
});
