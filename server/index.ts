import { createGameServer } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const { server } = createGameServer();

server.listen(port, host, () => {
  console.log("Boot complete", JSON.stringify({ port, host }));
});
