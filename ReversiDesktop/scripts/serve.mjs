import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const root = new URL("../web/", import.meta.url);
const host = "127.0.0.1";
const port = 4173;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root.pathname, safePath);

  if (existsSync(filePath) === false || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const type = contentTypes[extname(filePath)] ?? "application/octet-stream";
  response.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Reversi Desktop is running at http://${host}:${port}`);
});
