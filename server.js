/**
 * Real Server - Caching server with realtime updates
 * Serves cached stock data and broadcasts realtime updates via Socket.IO
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const http = require('http');

// Import our new modules
const cacheManager = require('./cache-manager');
const DataInitializer = require('./data-initializer');
const RealtimeManager = require('./realtime-manager');
const BroadcastService = require('./broadcast-service');
const Scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration toggle
const SERVER_MODE = 'cache'; // 'proxy' or 'cache'
// const SERVER_MODE = process.env.SERVER_MODE || 'cache'; // 'proxy' or 'cache'
const ENABLE_CACHE_MODE = SERVER_MODE === 'cache';

console.log(`[CONFIG] Server mode: ${SERVER_MODE} (Cache mode: ${ENABLE_CACHE_MODE})`);

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
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Origin',
            'device-id',
            'sec-ch-ua-platform',
            'Referer',
            'sec-ch-ua',
            'sec-ch-ua-mobile',
            'Device-Id',
            'User-Agent',
        ],
        credentials: true,
    }),
);

// Parse JSON bodies
app.use(express.json());

// Timing middleware for API endpoints
app.use('/', (req, res, next) => {
    console.log(`[API] ${req.method} ${req.originalUrl}`);
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function (data) {
        const duration = Date.now() - startTime;
        console.log(`[API-TIMING] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
        originalSend.call(this, data);
    };

    next();
});

// Timing middleware for GraphQL endpoint
app.use('/data-mt', (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function (data) {
        const duration = Date.now() - startTime;
        console.log(`[API-TIMING] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
        originalSend.call(this, data);
    };

    next();
});

// Handle preflight requests explicitly
app.options('*', (req, res) => {
    const origin = req.headers.origin;

    if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
    } else {
        res.header('Access-Control-Allow-Origin', '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, Origin, device-id, sec-ch-ua-platform, Referer, sec-ch-ua, sec-ch-ua-mobile, Device-Id, User-Agent',
    );
    res.header('Access-Control-Allow-Credentials', 'true');

    res.sendStatus(200);
});

// Initialize services
let dataInitializer;
let realtimeManager;
let broadcastService;
let scheduler;

// REST API Endpoints - Serve cached data (only in cache mode)
if (ENABLE_CACHE_MODE) {
    console.log('[CONFIG] Initializing cache mode endpoints...');

    /**
     * GET /price/symbols/getAll
     * Return all symbols metadata
     */
    app.get('/price/symbols/getAll', (req, res) => {
        console.log('[API] Getting all symbols');
        try {
            if (!cacheManager.isReady()) {
                return res.status(503).json({ error: 'Cache not ready' });
            }

            const symbols = cacheManager.getAllSymbols();
            console.log(`[API] Returning ${symbols.length} symbols metadata`);
            res.json(symbols);
        } catch (error) {
            console.error('[API] Error getting all symbols:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * GET /price/symbols/getByGroup?group=<GROUP>
     * Return symbols for a specific exchange group
     */
    app.get('/price/symbols/getByGroup', (req, res) => {
        try {
            const { group } = req.query;

            if (!group) {
                return res.status(400).json({ error: 'Missing group parameter' });
            }

            if (!cacheManager.isReady()) {
                return res.status(503).json({ error: 'Cache not ready' });
            }

            const symbols = cacheManager.getSymbolsByGroup(group);
            const symbolObjects = symbols.map((symbol) => ({ symbol }));

            console.log(`[API] Returning ${symbols.length} symbols for group: ${group}`);
            res.json(symbolObjects);
        } catch (error) {
            console.error('[API] Error getting symbols by group:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * POST /price/symbols/getList
     * Return stock data for specific symbols
     */
    app.post('/price/symbols/getList', (req, res) => {
        try {
            const { symbols } = req.body;

            if (!Array.isArray(symbols)) {
                return res.status(400).json({ error: 'Symbols must be an array' });
            }

            if (!cacheManager.isReady()) {
                return res.status(503).json({ error: 'Cache not ready' });
            }

            const stockDataMap = cacheManager.getStockDataBySymbols(symbols);

            // Convert to array format expected by frontend
            const result = Object.entries(stockDataMap).map(([symbol, data]) => ({
                listingInfo: {
                    symbol: symbol,
                    ceiling: data.tran,
                    refPrice: data.tc,
                    floor: data.san,
                },
                bidAsk: {
                    bidPrices: [
                        { price: data.duMuaGia1, volume: data.duMuaKL1 },
                        { price: data.duMuaGia2, volume: data.duMuaKL2 },
                        { price: data.duMuaGia3, volume: data.duMuaKL3 },
                    ],
                    askPrices: [
                        { price: data.duBanGia1, volume: data.duBanKL1 },
                        { price: data.duBanGia2, volume: data.duBanKL2 },
                        { price: data.duBanGia3, volume: data.duBanKL3 },
                    ],
                },
                matchPrice: {
                    matchPrice: data.khopLenhGia,
                    matchVol: data.khopLenhKL,
                    referencePrice: data.tc,
                    accumulatedVolume: data.khopLenhKLGD,
                    accumulatedValue: data.khopLenhGTGD,
                    avgMatchPrice: data.tb,
                    highest: data.cao,
                    lowest: data.thap,
                    foreignBuyVolume: data.nnMua,
                    foreignSellVolume: data.nnBan,
                    currentRoom: data.nnRoom,
                },
            }));

            console.log(`[API] Returning stock data for ${result.length}/${symbols.length} symbols`);
            res.json(result);
        } catch (error) {
            console.error('[API] Error getting stock data:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * POST /price/v3/symbols/w/compress/getList
     * Return compressed stock data (by symbols or group)
     */
    app.post('/price/v3/symbols/w/compress/getList', (req, res) => {
        try {
            const { symbols, group } = req.body;

            if (!cacheManager.isReady()) {
                return res.status(503).json({ error: 'Cache not ready' });
            }

            let stockDataMap;

            if (group) {
                // Return data for entire group
                stockDataMap = cacheManager.getStockDataByGroup(group);
            } else if (Array.isArray(symbols)) {
                // Return data for specific symbols
                stockDataMap = cacheManager.getStockDataBySymbols(symbols);
            } else {
                return res.status(400).json({ error: 'Must provide either symbols array or group' });
            }

            // Convert to compressed format
            const result = Object.entries(stockDataMap).map(([symbol, data]) => ({
                s: symbol, // symbol
                cei: data.tran, // ceiling
                ref: data.tc, // reference price
                flo: data.san, // floor
                bp1: data.duMuaGia1, // buy price 1
                bv1: data.duMuaKL1, // buy volume 1
                bp2: data.duMuaGia2, // buy price 2
                bv2: data.duMuaKL2, // buy volume 2
                bp3: data.duMuaGia3, // buy price 3
                bv3: data.duMuaKL3, // buy volume 3
                ap1: data.duBanGia1, // ask price 1
                av1: data.duBanKL1, // ask volume 1
                ap2: data.duBanGia2, // ask price 2
                av2: data.duBanKL2, // ask volume 2
                ap3: data.duBanGia3, // ask price 3
                av3: data.duBanKL3, // ask volume 3
                c: data.khopLenhGia, // current price
                mv: data.khopLenhKL, // match volume
                vo: data.khopLenhKLGD, // volume
                va: data.khopLenhGTGD, // value
                h: data.cao, // high
                l: data.thap, // low
                avgp: data.tb, // average price
                frbv: data.nnMua, // foreign buy volume
                frsv: data.nnBan, // foreign sell volume
                frcrr: data.nnRoom, // foreign room
            }));

            const requestType = group ? `group: ${group}` : `${symbols.length} symbols`;
            console.log(`[API] Returning compressed data for ${result.length} items (${requestType})`);
            res.json(result);
        } catch (error) {
            console.error('[API] Error getting compressed stock data:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * POST /price/marketIndex/getList
     * Return market indexes
     */
    app.post('/price/marketIndex/getList', (req, res) => {
        try {
            const { symbols } = req.body;

            if (!Array.isArray(symbols)) {
                return res.status(400).json({ error: 'Symbols must be an array' });
            }

            if (!cacheManager.isReady()) {
                return res.status(503).json({ error: 'Cache not ready' });
            }

            const indexes = cacheManager.getMarketIndexes(symbols);
            const result = Object.values(indexes);

            console.log(`[API] Returning ${result.length}/${symbols.length} market indexes`);
            res.json(result);
        } catch (error) {
            console.error('[API] Error getting market indexes:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * POST /data-mt/graphql
     * Return company listing info
     */
    app.post('/data-mt/graphql', (req, res) => {
        try {
            if (!cacheManager.isReady()) {
                return res.status(503).json({ error: 'Cache not ready' });
            }

            const companies = cacheManager.getCompanies();
            const tickers = cacheManager.getAllTickers();

            // Return GraphQL response format
            const result = {
                data: {
                    ListIcbCode: [], // Empty for now
                    CompaniesListingInfo: companies,
                },
            };

            console.log(`[API] Returning GraphQL data: ${companies.length} companies, ${tickers.length} tickers`);
            res.json(result);
        } catch (error) {
            console.error('[API] Error getting GraphQL data:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
} else {
    console.log('[CONFIG] Cache mode disabled - using proxy mode');
}

/**
 * POST /chart/OHLCChart/gap-chart
 * Proxy through to vietcap (NOT cached per requirements)
 */
app.post('/chart/OHLCChart/gap-chart', (req, res, next) => {
    const targetUrl = 'https://trading.vietcap.com.vn/chart/OHLCChart/gap-chart';

    const proxyOptions = {
        target: targetUrl,
        changeOrigin: true,
        secure: false,
        logLevel: 'info',
        onProxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] Proxying gap-chart request to: ${targetUrl}`);
        },
        onProxyRes: (proxyRes, req, res) => {
            // Set CORS headers
            const origin = req.headers.origin;
            if (origin) {
                proxyRes.headers['Access-Control-Allow-Origin'] = origin;
            } else {
                proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            }
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
        },
    };

    const proxy = createProxyMiddleware(proxyOptions);
    proxy(req, res, next);
});

// Keep existing proxy endpoint for backward compatibility
app.use('/proxy', (req, res, next) => {
    const targetUrl = req.query.target || req.headers['x-target-url'];

    if (!targetUrl) {
        return res.status(400).json({
            error: 'Missing target URL. Provide it as ?target=<url> or X-Target-Url header',
        });
    }

    try {
        new URL(targetUrl);
    } catch (error) {
        return res.status(400).json({
            error: 'Invalid target URL format',
        });
    }

    const proxyOptions = {
        target: targetUrl,
        changeOrigin: true,
        secure: false,
        logLevel: 'info',
        onProxyReq: (proxyReq, req, res) => {
            console.log(`[PROXY] Proxying request to: ${targetUrl}`);
        },
        onProxyRes: (proxyRes, req, res) => {
            // Set CORS headers
            const origin = req.headers.origin;
            if (origin) {
                proxyRes.headers['Access-Control-Allow-Origin'] = origin;
            } else {
                proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            }
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
        },
    };

    const proxy = createProxyMiddleware(proxyOptions);
    proxy(req, res, next);
});

// Health check endpoint with cache status
app.get('/health', (req, res) => {
    const response = {
        status: 'OK',
        message: `${SERVER_MODE.toUpperCase()} Server is running`,
        mode: SERVER_MODE,
        cacheMode: ENABLE_CACHE_MODE,
    };

    if (ENABLE_CACHE_MODE) {
        const stats = cacheManager.getStats();
        const realtimeStatus = realtimeManager
            ? realtimeManager.getStatus()
            : { isConnected: false, error: 'Not initialized' };
        const broadcastStats = broadcastService ? broadcastService.getStats() : null;
        const schedulerStatus = scheduler ? scheduler.getStatus() : { isRunning: false, error: 'Not initialized' };

        response.cache = {
            ready: cacheManager.isReady(),
            stats: stats,
        };
        response.realtime = realtimeStatus;
        response.broadcast = broadcastStats;
        response.scheduler = schedulerStatus;
    }

    res.json(response);
});

// Usage instructions
app.get('/', (req, res) => {
    const baseResponse = {
        message: `${SERVER_MODE.toUpperCase()} Server`,
        version: '2.0.0',
        mode: SERVER_MODE,
        cacheMode: ENABLE_CACHE_MODE,
        health: 'GET /health',
    };

    if (ENABLE_CACHE_MODE) {
        baseResponse.endpoints = {
            symbols: 'GET /price/symbols/getAll',
            symbolsByGroup: 'GET /price/symbols/getByGroup?group=<GROUP>',
            stockData: 'POST /price/symbols/getList',
            compressedData: 'POST /price/v3/symbols/w/compress/getList',
            marketIndexes: 'POST /price/marketIndex/getList',
            companies: 'POST /data-mt/graphql',
            gapChart: 'POST /chart/OHLCChart/gap-chart (proxied)',
            websocket: 'ws://localhost:' + PORT + '/ws/price/socket.io',
        };
        baseResponse.examples = {
            symbolsByGroup: 'http://localhost:' + PORT + '/price/symbols/getByGroup?group=HOSE',
            stockData: 'http://localhost:' + PORT + '/price/symbols/getList',
            compressedData: 'http://localhost:' + PORT + '/price/v3/symbols/w/compress/getList',
        };
    } else {
        baseResponse.endpoints = {
            proxy: 'GET /proxy?target=<TARGET_URL>',
            websocketProxy: 'ws://localhost:' + PORT + '/ws?target=<TARGET_WS_URL>',
            gapChart: 'POST /chart/OHLCChart/gap-chart (proxied)',
        };
        baseResponse.examples = {
            proxy: 'http://localhost:' + PORT + '/proxy?target=https:/.example.com/data',
            websocket: 'ws://localhost:' + PORT + '/ws?target=wss:/.example.com/websocket',
        };
    }

    res.json(baseResponse);
});

// Create HTTP server
const server = http.createServer(app);

// Initialize and start the server
async function startServer() {
    try {
        if (ENABLE_CACHE_MODE) {
            console.log('[SERVER] Starting Cache Server...');

            // Step 1: Initialize data
            console.log('[SERVER] Step 1: Initializing data...');
            dataInitializer = new DataInitializer();
            await dataInitializer.initialize();

            // Step 2: Initialize broadcast service
            console.log('[SERVER] Step 2: Initializing broadcast service...');
            broadcastService = new BroadcastService();
            broadcastService.initialize(server);

            // Step 3: Initialize realtime manager (optional)
            console.log('[SERVER] Step 3: Initializing realtime manager...');
            try {
                realtimeManager = new RealtimeManager();
                const allSymbols = dataInitializer.getAllSymbolsForRealtime();

                await realtimeManager.initialize(allSymbols, (message, type) => {
                    // Broadcast updates to clients
                    broadcastService.broadcastUpdate(message.symbol, type, message);
                });
                console.log('[SERVER] Realtime manager initialized successfully');
            } catch (error) {
                console.warn(
                    '[SERVER] Failed to initialize realtime manager, continuing without realtime updates:',
                    error.message,
                );
                realtimeManager = null;
            }

            // Step 4: Initialize scheduler for daily data refresh
            console.log('[SERVER] Step 4: Initializing data refresh scheduler...');
            try {
                scheduler = new Scheduler();
                scheduler.start();
                console.log('[SERVER] Scheduler initialized successfully');
            } catch (error) {
                console.warn('[SERVER] Failed to initialize scheduler:', error.message);
                scheduler = null;
            }
        } else {
            console.log('[SERVER] Starting Proxy Server...');
        }

        // Step 5: Start HTTP server
        console.log('[SERVER] Step 5: Starting HTTP server...');
        server.listen(PORT, () => {
            if (ENABLE_CACHE_MODE) {
                console.log(`[SERVER] Cache Server running on port ${PORT}`);
                console.log(`[SERVER] HTTP API: http://localhost:${PORT}/`);
                console.log(`[SERVER] WebSocket: ws://localhost:${PORT}/ws/price/socket.io`);
                console.log(`[SERVER] Cache ready: ${cacheManager.isReady()}`);
            } else {
                console.log(`[SERVER] Proxy Server running on port ${PORT}`);
                console.log(`[SERVER] HTTP Proxy: http://localhost:${PORT}/proxy?target=<TARGET_URL>`);
                console.log(`[SERVER] WebSocket Proxy: ws://localhost:${PORT}/ws?target=<TARGET_WS_URL>`);
            }
            console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('[SERVER] Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SERVER] Shutting down gracefully...');

    if (scheduler) {
        scheduler.stop();
    }

    if (realtimeManager) {
        realtimeManager.cleanup();
    }

    if (broadcastService) {
        broadcastService.cleanup();
    }

    server.close(() => {
        console.log('[SERVER] Server closed');
        process.exit(0);
    });
});

// Start the server
startServer();
