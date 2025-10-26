/**
 * Data Initializer - Fetches all data from vietcap APIs on startup
 * Populates the cache with initial data
 */

const axios = require('axios');
const cacheManager = require('./cache-manager');

class DataInitializer {
    constructor() {
        this.baseUrl = 'https://trading.vietcap.com.vn';
        this.headers = {
            accept: 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7',
            'content-type': 'application/json',
            'device-id': '1932fb6ac4452e03',
            'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        };
    }

    /**
     * Initialize all data by calling vietcap APIs
     */
    async initialize() {
        console.log('[INIT] Starting data initialization...');
        const startTime = Date.now();

        try {
            // Initialize cache manager
            cacheManager.initialize();

            // Step 1: Get all symbols metadata
            await this.loadAllSymbols();

            // Step 2: Get company listing info (GraphQL) - optional
            try {
                await this.loadCompanies();
            } catch (error) {
                console.warn('[INIT] Failed to load companies, continuing without them:', error.message);
                cacheManager.setCompanies([]);
            }

            // Step 3: Load stock data for each exchange
            const exchanges = ['HOSE', 'HNX', 'UPCOM', 'VN30', 'HNX30'];
            for (const exchange of exchanges) {
                await this.loadExchangeData(exchange);
            }

            // Step 4: Load market indexes
            await this.loadMarketIndexes();

            const duration = Date.now() - startTime;
            console.log(`[INIT] Data initialization completed in ${duration}ms`);
            console.log('[INIT] Cache stats:', cacheManager.getStats());
        } catch (error) {
            console.error('[INIT] Failed to initialize data:', error);
            throw error;
        }
    }

    /**
     * Load all symbols metadata
     */
    async loadAllSymbols() {
        console.log('[INIT] Loading all symbols metadata...');

        const url = `${this.baseUrl}/api/price/symbols/getAll`;
        const response = await axios.get(url, {
            headers: {
                ...this.headers,
                referrer:
                    'https://trading.vietcap.com.vn/price-board?filter-group=WL&filter-value=DEFAULT&view-type=FLAT',
            },
        });

        if (response.status !== 200) {
            throw new Error(`Failed to fetch symbols: ${response.status} ${response.statusText}`);
        }

        let symbols = response.data;

        symbols = symbols.filter((symbol) => symbol.group !== 'DELISTED' && symbol.type === 'STOCK');

        cacheManager.setSymbols(symbols);
        console.log(`[INIT] Loaded ${symbols.length} symbols metadata`);
    }

    /**
     * Load company listing info via GraphQL
     */
    async loadCompanies() {
        console.log('[INIT] Loading company listing info...');

        const url = `${this.baseUrl}/data-mt/graphql`;
        const body =
            '{"operationName":"Query","variables":{},"query":"query Query {\\n  ListIcbCode {\\n    icbCode\\n    level\\n    icbName\\n    enIcbName\\n    __typename\\n  }\\n  CompaniesListingInfo {\\n    ticker\\n    icbCode1\\n    icbCode2\\n    icbCode3\\n    icbCode4\\n    __typename\\n  }\\n}"}';

        const response = await axios.post(url, body, {
            headers: {
                ...this.headers,
                referrer:
                    'https://trading.vietcap.com.vn/price-board?filter-group=HOSE&filter-value=HOSE&view-type=FLAT',
            },
            withCredentials: true,
        });

        if (response.status !== 200) {
            throw new Error(`Failed to fetch companies: ${response.status} ${response.statusText}`);
        }

        const data = response.data;
        cacheManager.setCompanies(data.data.CompaniesListingInfo);
        console.log(`[INIT] Loaded ${data.data.CompaniesListingInfo.length} companies`);
    }

    /**
     * Load stock data for a specific exchange
     * @param {string} exchange - Exchange name (HOSE, HNX, UPCOM)
     */
    async loadExchangeData(exchange) {
        console.log(`[INIT] Loading ${exchange} exchange data...`);

        // First get symbols for this exchange
        const symbolsUrl = `${this.baseUrl}/api/price/symbols/getByGroup?group=${exchange}`;
        const symbolsResponse = await axios.get(symbolsUrl, {
            headers: this.headers,
        });

        if (symbolsResponse.status !== 200) {
            throw new Error(`Failed to fetch ${exchange} symbols: ${symbolsResponse.status}`);
        }

        const symbols = symbolsResponse.data;
        const symbolList = symbols.map((item) => item.symbol);
        cacheManager.setSymbolsByGroup(exchange, symbolList);
        console.log(`[INIT] Found ${symbolList.length} symbols for ${exchange}`);

        // Then get compressed stock data for all symbols
        const stockDataUrl = `${this.baseUrl}/api/price/v3/symbols/w/compress/getList`;
        const stockDataResponse = await axios.post(
            stockDataUrl,
            { group: exchange },
            {
                headers: {
                    ...this.headers,
                    referrer:
                        'https://trading.vietcap.com.vn/price-board?filter-group=HOSE&filter-value=HOSE&view-type=FLAT',
                },
            },
        );

        if (stockDataResponse.status !== 200) {
            throw new Error(`Failed to fetch ${exchange} stock data: ${stockDataResponse.status}`);
        }

        const stockDataArray = stockDataResponse.data;
        const stockDataMap = {};

        stockDataArray.forEach((item) => {
            // Transform compressed data to StockData format
            const stockData = this.transformCompressedToStockData(item);
            stockDataMap[item.s] = stockData;
        });

        cacheManager.setMultipleStockData(stockDataMap);
        console.log(`[INIT] Loaded ${Object.keys(stockDataMap).length} stock data entries for ${exchange}`);
    }

    /**
     * Load market indexes
     */
    async loadMarketIndexes() {
        console.log('[INIT] Loading market indexes...');

        // Common market indexes
        const indexSymbols = ['VN30', 'VNINDEX', 'HNX30', 'HNXIndex', 'HNXUpcomIndex'];

        const url = `${this.baseUrl}/api/price/marketIndex/getList`;
        const response = await axios.post(
            url,
            { symbols: indexSymbols },
            {
                headers: {
                    ...this.headers,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            },
        );

        if (response.status !== 200) {
            throw new Error(`Failed to fetch market indexes: ${response.status} ${response.statusText}`);
        }

        const indexes = response.data;
        const indexesMap = {};

        indexes.forEach((index) => {
            indexesMap[index.symbol] = index;
        });

        cacheManager.setMarketIndexes(indexesMap);
        console.log(`[INIT] Loaded ${indexes.length} market indexes`);
    }

    /**
     * Transform compressed data to StockData format
     * @param {Object} model - Compressed data from API
     * @returns {Object} StockData object
     */
    transformCompressedToStockData(model) {
        const priceChange = model.c - model.ref;
        const priceChangePercent = model.ref > 0 ? (priceChange / model.ref) * 100 : 0;

        return {
            maCK: model.s, // Stock Code
            tran: model.cei, // Ceiling
            tc: model.ref, // Reference Price
            san: model.flo, // Floor

            // Buy orders
            duMuaGia3: model.bp3 || 0, // Buy Price 3
            duMuaKL3: model.bv3 || 0, // Buy Volume 3
            duMuaGia2: model.bp2 || 0, // Buy Price 2
            duMuaKL2: model.bv2 || 0, // Buy Volume 2
            duMuaGia1: model.bp1 || 0, // Buy Price 1
            duMuaKL1: model.bv1 || 0, // Buy Volume 1

            // Match orders
            khopLenhGia: model.c || 0, // Match Price
            khopLenhKL: model.mv || 0, // Match Volume
            khopLenhChange: priceChange, // Price Change
            khopLenhPercent: priceChangePercent, // Price Change Percent
            khopLenhKLGD: model.vo || 0, // Total Match Volume
            khopLenhGTGD: model.va || 0, // Total Match Value

            // Sell orders
            duBanGia1: model.ap1 || 0, // Sell Price 1
            duBanKL1: model.av1 || 0, // Sell Volume 1
            duBanGia2: model.ap2 || 0, // Sell Price 2
            duBanKL2: model.av2 || 0, // Sell Volume 2
            duBanGia3: model.ap3 || 0, // Sell Price 3
            duBanKL3: model.av3 || 0, // Sell Volume 3

            // Price range
            cao: model.h || 0, // High Price
            tb: model.avgp ? Number(model.avgp.toFixed(0)) : model.avgp, // Average Price
            thap: model.l || 0, // Low Price

            // Foreign trading
            nnMua: model.frbv || 0, // Foreign Buy Value
            nnBan: model.frsv || 0, // Foreign Sell Value
            nnRoom: model.frcrr || 0, // Foreign Room

            // Total volume
            klgdTT: model.vo || 0, // Total Trading Volume
            gtgdTT: model.va || 0, // Total Trading Value
        };
    }

    /**
     * Get all symbols from cache for realtime subscription
     * @returns {Array} Array of all symbol strings
     */
    getAllSymbolsForRealtime() {
        const allSymbols = [];

        // Get symbols from each exchange
        ['HOSE', 'HNX', 'UPCOM', 'VN30', 'HNX30'].forEach((exchange) => {
            const symbols = cacheManager.getSymbolsByGroup(exchange);
            allSymbols.push(...symbols);
        });

        // Add market indexes for index message subscription
        const marketIndexes = ['VN30', 'VNINDEX', 'HNX30', 'HNXIndex', 'HNXUpcomIndex'];
        allSymbols.push(...marketIndexes);

        // Remove duplicates
        return [...new Set(allSymbols)];
    }
}

module.exports = DataInitializer;
