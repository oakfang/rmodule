const rmodule = require(".");
const wrtc = require("wrtc");
const ws = require("ws");

const remote = rmodule({ ws, wrtc, signaling: "ws://localhost:4000" });
const browser = remote("browser");

browser.log("Meow");

remote.module("server", {
  print(args, resolve) {
    console.log(...args);
    resolve();
  }
});
