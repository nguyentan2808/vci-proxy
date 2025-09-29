const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cors = require("cors");
const WebSocket = require("ws");
const http = require("http");
const url = require("url");

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS with dynamic origin handling for credentials
app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);

            // For requests with credentials, return the specific origin
            // For requests without credentials, allow any origin
            return callback(null, origin);
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "device-id"],
        credentials: true,
    })
);

// Handle preflight requests explicitly
app.options("*", (req, res) => {
    const origin = req.headers.origin;

    if (origin) {
        res.header("Access-Control-Allow-Origin", origin);
    } else {
        res.header("Access-Control-Allow-Origin", "*");
    }

    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, Accept, Origin, device-id"
    );
    res.header("Access-Control-Allow-Credentials", "true");

    res.sendStatus(200);
});

// Proxy configuration for HTTP requests
const createProxyOptions = (targetUrl) => {
    const parsedUrl = new URL(targetUrl);
    return {
        target: `${parsedUrl.protocol}//${parsedUrl.host}`,
        changeOrigin: true,
        secure: false,
        logLevel: "info",
        pathRewrite: (path, req) => {
            // Remove /proxy prefix and replace with the target path
            const targetUrl = req.query.target || req.headers["x-target-url"];
            const parsedTarget = new URL(targetUrl);
            console.log(`Rewriting path from ${path} to ${parsedTarget.pathname}${parsedTarget.search}`);
            return `${parsedTarget.pathname}${parsedTarget.search}`;
        },
        onProxyReq: (proxyReq, req, res) => {
            // Log the outgoing request for debugging
            console.log(`Proxying ${req.method} request to: ${proxyReq.getHeader("host")}${proxyReq.path}`);
        },
        onProxyRes: (proxyRes, req, res) => {
            // Set CORS headers on response to match our CORS policy
            const origin = req.headers.origin;
            if (origin) {
                proxyRes.headers["Access-Control-Allow-Origin"] = origin;
            } else {
                proxyRes.headers["Access-Control-Allow-Origin"] = "*";
            }

            proxyRes.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH";
            proxyRes.headers["Access-Control-Allow-Headers"] =
                "Content-Type, Authorization, X-Requested-With, Accept, Origin, device-id";
            proxyRes.headers["Access-Control-Allow-Credentials"] = "true";

            // Remove restrictive headers
            delete proxyRes.headers["X-Frame-Options"];
            delete proxyRes.headers["x-frame-options"];
        },
    };
};
app.use("/proxy", (req, res, next) => {
    const start = Date.now();
    console.log(`\n[START] ${req.method} ${req.originalUrl}`);

    const targetUrl = req.query.target || req.headers["x-target-url"];

    if (!targetUrl) {
        return res.status(400).json({
            error: "Missing target URL. Provide it as ?target=<url> or X-Target-Url header",
        });
    }

    try {
        new URL(targetUrl);
    } catch (error) {
        return res.status(400).json({
            error: "Invalid target URL format",
        });
    }

    const proxyOptions = createProxyOptions(targetUrl);

    // Step 1: Request arrives at proxy
    proxyOptions.onProxyReq = (proxyReq, req, res) => {
        req._tProxyReq = Date.now();
        console.log(`[STEP 1] Request received at proxy: ${req._tProxyReq - start} ms since start`);
        console.log(
            `[STEP 2] Outgoing request sent to target: host=${proxyReq.getHeader("host")}, path=${proxyReq.path}`
        );
    };

    // Step 2: Response comes back from target
    proxyOptions.onProxyRes = (proxyRes, req, res) => {
        req._tProxyRes = Date.now();
        console.log(
            `[STEP 3] Response received from target: ${req._tProxyRes - req._tProxyReq} ms after sending request`
        );

        // Final step: when response is finished sending back to client
        res.on("finish", () => {
            const end = Date.now();
            console.log(`[STEP 4] Response delivered to client: ${end - req._tProxyRes} ms after target response`);
            console.log(`[TOTAL] End-to-end latency: ${end - start} ms\n`);
        });
    };

    const proxy = createProxyMiddleware(proxyOptions);
    proxy(req, res, next);
});
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "OK", message: "CORS Proxy Server is running" });
});

// Usage instructions
app.get("/", (req, res) => {
    res.json({
        message: "CORS Proxy Server",
        usage: {
            http: "http://localhost:" + PORT + "/proxy?target=<TARGET_URL>",
            websocket: "ws://localhost:" + PORT + "/ws?target=<TARGET_WS_URL>",
            examples: {
                http: "http://localhost:" + PORT + "/proxy?target=https://api.example.com/data",
                websocket: "ws://localhost:" + PORT + "/ws?target=wss://api.example.com/websocket",
            },
        },
    });
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket proxy setup
const wss = new WebSocket.Server({
    server,
    path: "/ws",
});

wss.on("connection", (clientWs, request) => {
    const queryParams = new URLSearchParams(request.url.split("?")[1]);
    const targetUrl = queryParams.get("target");

    if (!targetUrl) {
        clientWs.close(1008, "Missing target WebSocket URL");
        return;
    }

    let targetWs;

    try {
        // Connect to target WebSocket
        targetWs = new WebSocket(targetUrl);

        targetWs.on("open", () => {
            console.log(`WebSocket proxy connected to: ${targetUrl}`);
        });

        targetWs.on("message", (data) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data);
            }
        });

        targetWs.on("close", (code, reason) => {
            console.log(`Target WebSocket closed: ${code} ${reason}`);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(code, reason);
            }
        });

        targetWs.on("error", (error) => {
            console.error("Target WebSocket error:", error);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(1011, "Target WebSocket error");
            }
        });

        // Forward messages from client to target
        clientWs.on("message", (data) => {
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(data);
            }
        });

        clientWs.on("close", () => {
            console.log("Client WebSocket disconnected");
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.close();
            }
        });

        clientWs.on("error", (error) => {
            console.error("Client WebSocket error:", error);
            if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.close();
            }
        });
    } catch (error) {
        console.error("Failed to connect to target WebSocket:", error);
        clientWs.close(1011, "Failed to connect to target WebSocket");
    }
});

server.listen(PORT, () => {
    console.log(`CORS Proxy Server running on port ${PORT}`);
    console.log(`HTTP Proxy: http://localhost:${PORT}/proxy?target=<TARGET_URL>`);
    console.log(`WebSocket Proxy: ws://localhost:${PORT}/ws?target=<TARGET_WS_URL>`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
