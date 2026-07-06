import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  completeCareTask,
  delayCareTask,
  getTodayCare,
  skipCareTask
} from "./services/todayCareService.js";

const frontendDirectory = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
const port = Number(process.env.PORT || 4173);
const configuredFrontendOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean)
);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isAllowedOrigin(origin) {
  return configuredFrontendOrigins.has(origin) ||
    origin === "https://greenmate-demo.vercel.app" ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    /^https:\/\/green-mate-frontend[^.]*\.vercel\.app$/.test(origin);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function serveFile(response, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = join(frontendDirectory, requestedPath);

  if (!filePath.startsWith(frontendDirectory)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error("Not a file");

    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const origin = request.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    response.writeHead(204).end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/today") {
    // The API owns weather resolution and care generation; React only supplies settings.
    const requestedDate = url.searchParams.get("date");
    const careDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "")
      ? requestedDate
      : today();
    const latitudeParam = url.searchParams.get("latitude");
    const longitudeParam = url.searchParams.get("longitude");
    const latitude = Number(latitudeParam);
    const longitude = Number(longitudeParam);
    const hasCoordinates =
      latitudeParam !== null && longitudeParam !== null &&
      Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    const weatherOptions = {
      location: url.searchParams.get("location") || "Auckland",
      ...(hasCoordinates ? { latitude, longitude } : {})
    };

    try {
      const tasks = await getTodayCare(careDate, undefined, { weatherOptions });

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(tasks));
    } catch (error) {
      console.error("Unable to load today's care:", error.message);
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ message: "Care tasks are temporarily unavailable." }));
    }
    return;
  }

  const taskActionMatch = url.pathname.match(
    /^\/api\/tasks\/([0-9a-f-]+)\/(complete|delay|skip)$/i
  );
  if (request.method === "POST" && taskActionMatch) {
    const [, taskId, action] = taskActionMatch;

    try {
      if (action === "complete") {
        await completeCareTask(taskId, await readJsonBody(request));
      } else if (action === "skip") {
        await skipCareTask(taskId, await readJsonBody(request));
      } else {
        await delayCareTask(taskId);
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          id: taskId,
          status:
            action === "complete"
              ? "completed"
              : action === "skip"
                ? "skipped"
                : "delayed"
        })
      );
    } catch (error) {
      const isValidationError = error instanceof TypeError;
      const statusCode = isValidationError ? 400 : 409;
      if (!isValidationError) {
        console.error(`Unable to ${action} care task:`, error.message);
      }
      response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(
        JSON.stringify({
          message: isValidationError
            ? error.message
            : "The care task could not be updated."
        })
      );
    }
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" }).end();
    return;
  }

  await serveFile(response, decodeURIComponent(url.pathname));
});

server.listen(port, () => {
  console.log(`GreenMate is running at http://localhost:${port}`);
});
