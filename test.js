const rmodule = require(".");
const wrtc = require("wrtc");
const ws = require("ws");
const Coven = require("coven");

const coven = new Coven({ ws, wrtc, signaling: "ws://localhost:4000" });
coven.on("connected", () => {
  const remote = rmodule(coven);

  const browser = remote("browser");

  browser.log("Meow");

  remote.module("server", {
    print(args, resolve) {
      console.log(...args);
      resolve();
    }
  });
});
