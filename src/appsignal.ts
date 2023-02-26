import { Appsignal } from "@appsignal/nodejs";

export const appsignal = new Appsignal({
  name: "crank",
  active: !!process.env.RENDER,
  pushApiKey: process.env.APPSIGNAL,
  revision: process.env.RENDER_GIT_COMMIT,
  logLevel: "debug",
});
