const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const { onRequest: middleware } = require("../../functions/api/admin/_middleware.js");
const { onRequestPost: loginPost } = require("../../functions/api/admin/login.js");
const { onRequestGet: verifyGet } = require("../../functions/api/admin/verify.js");
const { onRequestPost: logoutPost } = require("../../functions/api/admin/logout.js");
const { onRequestGet: productosGet, onRequestPost: productosPost, onRequestPatch: productosPatch, onRequestDelete: productosDelete } = require("../../functions/api/admin/productos.js");
const { onRequestPost: uploadPost } = require("../../functions/api/admin/upload.js");
const { onRequestPost: cleanupPost } = require("../../functions/api/admin/storage/cleanup-orphans.js");

function createCloudflareStagingServer(stagingEnv, port = 8788) {
  const rootDir = path.resolve(__dirname, "../../");

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Helper para convertir req de Node a Request estándar Fetch API
    const fullUrl = `http://127.0.0.1:${port}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach(val => headers.append(k, val));
      else if (v) headers.set(k, v);
    }

    let bodyBuffer = [];
    req.on("data", chunk => bodyBuffer.push(chunk));
    req.on("end", async () => {
      const rawBody = Buffer.concat(bodyBuffer);

      const fetchReq = new Request(fullUrl, {
        method: req.method,
        headers: headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : rawBody
      });

      // Manejo de Cloudflare Pages Functions (/api/admin/*)
      if (pathname.startsWith("/api/admin")) {
        const context = {
          request: fetchReq,
          env: stagingEnv,
          data: {},
          next: async () => {
            // Router de funciones internas
            if (pathname === "/api/admin/login" && req.method === "POST") return loginPost(context);
            if (pathname === "/api/admin/verify" && req.method === "GET") return verifyGet(context);
            if (pathname === "/api/admin/logout" && req.method === "POST") return logoutPost(context);
            if (pathname === "/api/admin/productos") {
              if (req.method === "GET") return productosGet(context);
              if (req.method === "POST") return productosPost(context);
              if (req.method === "PATCH") return productosPatch(context);
              if (req.method === "DELETE") return productosDelete(context);
            }
            if (pathname === "/api/admin/upload" && req.method === "POST") return uploadPost(context);
            if (pathname === "/api/admin/storage/cleanup-orphans" && req.method === "POST") return cleanupPost(context);

            return new Response("Not found", { status: 404 });
          }
        };

        try {
          const fetchRes = await middleware(context);
          res.writeHead(fetchRes.status, Object.fromEntries(fetchRes.headers.entries()));
          const resBody = await fetchRes.arrayBuffer();
          res.end(Buffer.from(resBody));
        } catch (err) {
          console.error("Error en staging worker:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // Inyección dinámica de configuración de Staging para el frontend
      if (pathname === "/config.js" && stagingEnv.SUPABASE_URL) {
        const dynamicConfig = `// Configuración inyectada dinámicamente por el servidor de staging\nwindow.__SUPABASE_CONFIG__ = { url: "${stagingEnv.SUPABASE_URL}", anonKey: "${stagingEnv.SUPABASE_ANON_KEY || 'sb_publishable_ZHXeQPBpa5jM2XVXLijSwA_gys8Oqpa'}" };\n`;
        res.writeHead(200, { "Content-Type": "application/javascript" });
        return res.end(dynamicConfig);
      }

      // Servidor de archivos estáticos (Frontend)
      let filePath = path.join(rootDir, pathname === "/" ? "index.html" : pathname);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end("File not found");
      }

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png"
      };

      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  return {
    server,
    start: () => new Promise(resolve => server.listen(port, resolve)),
    close: () => new Promise(resolve => server.close(resolve))
  };
}

module.exports = { createCloudflareStagingServer };
