import Appsignal from "@appsignal/javascript"; // For ES Module

export const appsignal = new Appsignal.default({
  key: process.env.APPSIGNAL,
});
