import { handleTask } from "./protocol";
// One-shot self-check only: no timers, requests, browser session or MCP access.
console.log(
  JSON.stringify(
    handleTask({
      version: 1,
      id: "local-self-check",
      type: "HEALTHCHECK",
      accountStatus: "PAUSED",
    }),
  ),
);
