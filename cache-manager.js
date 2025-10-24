/**
 * Cache Manager - In-memory data storage for stock data
 * Manages symbols, stock data, market indexes, and company info
 */

class CacheManager {
    constructor() {
        // Core data structures
        this.symbols = new Map(); // symbol -> SymbolInfo
        this.stockData = new Map(); // symbol -> StockData
        this.symbolsByGroup = new Map(); // group -> [symbols]
        this.marketIndexes = new Map(); // symbol -> MarketIndex
        this.companies = []; // Array<CompanyInfo>

        // Metadata
        this.lastUpdate = new Date();
        this.isInitialized = false;
        this.stats = {
            symbolsCount: 0,
            stockDataCount: 0,
            groupsCount: 0,
            marketIndexesCount: 0,
            companiesCount: 0,
        };
    }

    /**
     * Initialize cache with empty data structures
     */
    initialize() {
        console.log('[CACHE] Initializing cache manager');
        this.isInitialized = true;
        this.lastUpdate = new Date();
    }

    /**
     * Set all symbols metadata
     * @param {Array} symbols - Array of SymbolInfo objects
     */
    setSymbols(symbols) {
        console.log(`[CACHE] Setting ${symbols.length} symbols`);
        this.symbols.clear();

        symbols.forEach((symbol) => {
            this.symbols.set(symbol.symbol || symbol.ticker, symbol);
        });

        this.stats.symbolsCount = this.symbols.size;
        this.lastUpdate = new Date();
    }

    /**
     * Set stock data for a specific symbol
     * @param {string} symbol - Stock symbol
     * @param {Object} data - StockData object
     */
    setStockData(symbol, data) {
        this.stockData.set(symbol, data);
        this.stats.stockDataCount = this.stockData.size;
    }

    /**
     * Set stock data for multiple symbols
     * @param {Object} stockDataMap - Map of symbol -> StockData
     */
    setMultipleStockData(stockDataMap) {
        Object.entries(stockDataMap).forEach(([symbol, data]) => {
            this.setStockData(symbol, data);
        });
        console.log(`[CACHE] Updated ${Object.keys(stockDataMap).length} stock data entries`);
    }

    /**
     * Set symbols grouped by exchange
     * @param {string} group - Exchange group (HOSE, HNX, UPCOM, etc.)
     * @param {Array} symbols - Array of symbol strings
     */
    setSymbolsByGroup(group, symbols) {
        this.symbolsByGroup.set(group, symbols);
        this.stats.groupsCount = this.symbolsByGroup.size;
        console.log(`[CACHE] Set ${symbols.length} symbols for group ${group}`);
    }

    /**
     * Set market index data
     * @param {string} symbol - Index symbol (e.g., VN30)
     * @param {Object} data - MarketIndex object
     */
    setMarketIndex(symbol, data) {
        this.marketIndexes.set(symbol, data);
        this.stats.marketIndexesCount = this.marketIndexes.size;
    }

    /**
     * Set multiple market indexes
     * @param {Object} indexesMap - Map of symbol -> MarketIndex
     */
    setMarketIndexes(indexesMap) {
        Object.entries(indexesMap).forEach(([symbol, data]) => {
            this.setMarketIndex(symbol, data);
        });
        console.log(`[CACHE] Updated ${Object.keys(indexesMap).length} market indexes`);
    }

    /**
     * Set company listing info
     * @param {Array} companies - Array of CompanyInfo objects
     */
    setCompanies(companies) {
        this.companies = companies;
        this.stats.companiesCount = companies.length;
        console.log(`[CACHE] Set ${companies.length} companies`);
    }

    /**
     * Get symbols for a specific group
     * @param {string} group - Exchange group
     * @returns {Array} Array of symbol strings
     */
    getSymbolsByGroup(group) {
        return this.symbolsByGroup.get(group) || [];
    }

    /**
     * Get stock data for specific symbols
     * @param {Array} symbols - Array of symbol strings
     * @returns {Object} Map of symbol -> StockData
     */
    getStockDataBySymbols(symbols) {
        const result = {};
        symbols.forEach((symbol) => {
            const data = this.stockData.get(symbol);
            if (data) {
                result[symbol] = data;
            }
        });
        return result;
    }

    /**
     * Get stock data for a group
     * @param {string} group - Exchange group
     * @returns {Object} Map of symbol -> StockData
     */
    getStockDataByGroup(group) {
        const symbols = this.getSymbolsByGroup(group);
        return this.getStockDataBySymbols(symbols);
    }

    /**
     * Get all symbols metadata
     * @returns {Array} Array of SymbolInfo objects
     */
    getAllSymbols() {
        return Array.from(this.symbols.values());
    }

    /**
     * Get market indexes for specific symbols
     * @param {Array} symbols - Array of index symbols
     * @returns {Object} Map of symbol -> MarketIndex
     */
    getMarketIndexes(symbols) {
        const result = {};
        if (symbols.length === 0) {
            return result;
        }

        symbols.forEach((symbol) => {
            const data = this.marketIndexes.get(symbol);
            if (data) {
                result[symbol] = data;
            }
        });
        return result;
    }

    /**
     * Get all companies
     * @returns {Array} Array of CompanyInfo objects
     */
    getCompanies() {
        return this.companies;
    }

    /**
     * Get all symbols as ticker strings (for GraphQL response)
     * @returns {Array} Array of ticker strings
     */
    getAllTickers() {
        return this.companies.map((company) => company.ticker);
    }

    /**
     * Update stock data from realtime message
     * @param {string} symbol - Stock symbol
     * @param {Object} updateData - Partial StockData update
     */
    updateStockData(symbol, updateData) {
        const existingData = this.stockData.get(symbol) || {};
        const updatedData = { ...existingData, ...updateData };
        this.setStockData(symbol, updatedData);
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            lastUpdate: this.lastUpdate,
            isInitialized: this.isInitialized,
            memoryUsage: {
                symbols: this.symbols.size,
                stockData: this.stockData.size,
                groups: this.symbolsByGroup.size,
                marketIndexes: this.marketIndexes.size,
                companies: this.companies.length,
            },
        };
    }

    /**
     * Clear all cache data
     */
    clear() {
        this.symbols.clear();
        this.stockData.clear();
        this.symbolsByGroup.clear();
        this.marketIndexes.clear();
        this.companies = [];
        this.isInitialized = false;
        this.stats = {
            symbolsCount: 0,
            stockDataCount: 0,
            groupsCount: 0,
            marketIndexesCount: 0,
            companiesCount: 0,
        };
        console.log('[CACHE] Cache cleared');
    }

    /**
     * Check if cache is ready for serving requests
     * @returns {boolean} True if cache is initialized and has data
     */
    isReady() {
        return this.isInitialized && this.symbols.size > 0 && this.stockData.size > 0;
    }
}

// Export singleton instance
module.exports = new CacheManager();
