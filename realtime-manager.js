/**
 * Realtime Manager - Maintains WebSocket connection to vietcap for realtime updates
 * Decodes protobuf messages and updates cache
 */

const { io } = require('socket.io-client');
const protobuf = require('protobufjs');
const path = require('path');
const cacheManager = require('./cache-manager');

class RealtimeManager {
    constructor() {
        this.socket = null;
        this.messageTypes = {};
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.symbols = [];
        this.onUpdateCallback = null;

        // Configuration
        this.config = {
            serverUrl: 'https://trading.vietcap.com.vn',
            socketPath: '/ws/price/socket.io',
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        };
    }

    /**
     * Initialize the realtime connection
     * @param {Array} symbols - Array of symbols to subscribe to
     * @param {Function} onUpdate - Callback when data is updated
     */
    async initialize(symbols, onUpdate) {
        // console.log('[REALTIME] Initializing realtime manager...');

        this.symbols = symbols;
        this.onUpdateCallback = onUpdate;

        try {
            // Load protobuf schema
            await this.loadProtobufSchema();

            // Setup socket connection
            this.setupSocket();

            // console.log(`[REALTIME] Initialized for ${symbols.length} symbols`);
        } catch (error) {
            console.error('[REALTIME] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Load protobuf schema from price.proto file
     */
    async loadProtobufSchema() {
        try {
            const protoPath = path.join('./price.proto');
            const root = await protobuf.load(protoPath);

            // Cache message types for better performance
            this.messageTypes = {
                index: root.lookupType('pricePackage.IndexMessage'),
                'match-price': root.lookupType('pricePackage.MatchPriceMessage'),
                oddLotMatchPrice: root.lookupType('pricePackage.OddLotMatchPriceMessage'),
                futureMatchPrice: root.lookupType('pricePackage.FutureMatchPrice'),
                'bid-ask': root.lookupType('pricePackage.BidAskMessage'),
                oddLotBidAsk: root.lookupType('pricePackage.OddLotBidAskMessage'),
                putThrough: root.lookupType('pricePackage.PutThroughMessage'),
                advertise: root.lookupType('pricePackage.AdvertiseMessage'),
                globalPrice: root.lookupType('pricePackage.GlobalPriceMessage'),
            };

            // console.log('[REALTIME] Protobuf schema loaded successfully');
        } catch (error) {
            console.error('[REALTIME] Failed to load protobuf schema:', error);
            throw error;
        }
    }

    /**
     * Setup socket connection to vietcap
     */
    setupSocket() {
        this.socket = io(this.config.serverUrl, {
            path: this.config.socketPath,
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: this.config.reconnectionAttempts,
            reconnectionDelay: this.config.reconnectionDelay,
        });

        this.setupSocketEventHandlers();
    }

    /**
     * Setup socket event handlers
     */
    setupSocketEventHandlers() {
        if (!this.socket) return;

        // Connection event handlers
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            // console.log('[REALTIME] Connected to vietcap server');
            this.subscribeToSymbols();
        });

        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            // console.log('[REALTIME] Disconnected from vietcap server:', reason);
        });

        this.socket.on('connect_error', (error) => {
            this.reconnectAttempts++;
            console.error(`[REALTIME] Connection attempt ${this.reconnectAttempts} failed:`, error.message);

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[REALTIME] Max reconnection attempts reached');
            }
        });

        this.socket.on('reconnect', (attemptNumber) => {
            // console.log(`[REALTIME] Reconnected after ${attemptNumber} attempts`);
        });

        this.socket.on('reconnect_error', (error) => {
            console.error('[REALTIME] Reconnection failed:', error);
        });

        // Message handlers for different types
        this.socket.on('match-price', (data) => this.handleMessage('match-price', data));
        this.socket.on('bid-ask', (data) => this.handleMessage('bid-ask', data));
        this.socket.on('index', (data) => this.handleMessage('index', data));
    }

    /**
     * Subscribe to symbols for realtime updates
     */
    subscribeToSymbols() {
        if (!this.socket || !this.isConnected) {
            console.warn('[REALTIME] Cannot subscribe - socket not connected');
            return;
        }

        try {
            const subscriptionMessage = JSON.stringify({ symbols: this.symbols });
            this.socket.emit('match-price', subscriptionMessage);
            this.socket.emit('bid-ask', subscriptionMessage);
            this.socket.emit(
                'index',
                JSON.stringify({ symbols: ['VN30', 'VNINDEX', 'HNX30', 'HNXIndex', 'HNXUpcomIndex'] }),
            );
            // console.log(`[REALTIME] Subscribed to ${this.symbols.length} symbols`);
        } catch (error) {
            console.error('[REALTIME] Failed to subscribe to symbols:', error);
        }
    }

    /**
     * Handle incoming realtime messages
     * @param {string} type - Message type ('match-price', 'bid-ask', or 'index')
     * @param {Buffer} data - Raw protobuf data
     */
    handleMessage(type, data) {
        const startTime = Date.now();

        try {
            // console.log(`[SOCKET-MSG] Received ${type} message (${data.length} bytes)`);

            const messageType = this.messageTypes[type];
            if (!messageType) {
                console.warn(`[SOCKET-MSG] Unknown message type: ${type}`);
                return;
            }

            const message = messageType.decode(new Uint8Array(data));
            const decodedMessage = messageType.toObject(message, {
                longs: String,
                enums: String,
                defaults: true,
            });

            // Validate essential fields
            if (!decodedMessage.symbol) {
                console.warn(`[SOCKET-MSG] Missing symbol in ${type} message`);
                return;
            }

            // if (type === 'index') {
            //     console.log(`[SOCKET-MSG] Index message:`, {
            //         symbol: decodedMessage.symbol,
            //         price: decodedMessage.price,
            //         change: decodedMessage.change,
            //     });
            //     return;
            // }

            const decodeTime = Date.now() - startTime;
            // console.log(`[SOCKET-MSG] Decoded ${type} for ${decodedMessage.symbol} in ${decodeTime}ms`);

            // Update cache with new data
            this.updateCache(decodedMessage, type);

            // Notify callback if provided
            if (this.onUpdateCallback) {
                this.onUpdateCallback(decodedMessage, type);
            }

            const totalTime = Date.now() - startTime;
            // console.log(`[SOCKET-MSG] Processed ${type} for ${decodedMessage.symbol} in ${totalTime}ms total`);
        } catch (error) {
            const errorTime = Date.now() - startTime;
            console.error(`[SOCKET-MSG] Error processing ${type} message after ${errorTime}ms:`, error);
        }
    }

    /**
     * Update cache with realtime data
     * @param {Object} message - Decoded message
     * @param {string} type - Message type
     */
    updateCache(message, type) {
        const symbol = message.symbol;

        if (type === 'match-price') {
            // Update match price data
            const updateData = {
                khopLenhGia: message.matchPrice,
                khopLenhKL: message.matchVol,
                khopLenhChange: message.matchPrice - message.referencePrice,
                khopLenhPercent: ((message.matchPrice - message.referencePrice) / message.referencePrice) * 100,
                khopLenhKLGD: message.accumulatedVolume,
                khopLenhGTGD: message.accumulatedValue,
                gtgdTT: message.accumulatedValue,
                nnRoom: message.currentRoom,
                nnMua: message.foreignBuyVolume,
                nnBan: message.foreignSellVolume,
                tb: message.avgMatchPrice ? Number(message.avgMatchPrice.toFixed(0)) : message.avgMatchPrice,
                cao: message.highest,
                thap: message.lowest,
            };
            cacheManager.updateStockData(symbol, updateData);
            // console.log(`[CACHE-UPDATE] Updated match-price for ${symbol}: price=${message.matchPrice}, volume=${message.matchVol}`);
        } else if (type === 'bid-ask') {
            // Update bid-ask data
            const bidPrices = message.bidPrices || [];
            const askPrices = message.askPrices || [];

            const updateData = {
                duMuaGia1: bidPrices[0]?.price ?? 0,
                duMuaKL1: bidPrices[0]?.volume ?? 0,
                duMuaGia2: bidPrices[1]?.price ?? 0,
                duMuaKL2: bidPrices[1]?.volume ?? 0,
                duMuaGia3: bidPrices[2]?.price ?? 0,
                duMuaKL3: bidPrices[2]?.volume ?? 0,
                duBanGia1: askPrices[0]?.price ?? 0,
                duBanKL1: askPrices[0]?.volume ?? 0,
                duBanGia2: askPrices[1]?.price ?? 0,
                duBanKL2: askPrices[1]?.volume ?? 0,
                duBanGia3: askPrices[2]?.price ?? 0,
                duBanKL3: askPrices[2]?.volume ?? 0,
            };
            cacheManager.updateStockData(symbol, updateData);
            // console.log(`[CACHE-UPDATE] Updated bid-ask for ${symbol}: bid1=${bidPrices[0]?.price || 0}, ask1=${askPrices[0]?.price || 0}`);
        } else if (type === 'index' && message.symbol.includes('VN30')) {
            // Update market index data
            console.log(
                `[CACHE-UPDATE] Updated index for ${symbol}: price=${message.price}, change=${message.change}%`,
            );
            const indexData = {
                code: message.code,
                symbol: message.symbol,
                price: message.price,
                change: message.change,
                changePercent: message.changePercent,
                totalShares: message.totalShares,
                totalValue: message.totalValue,
                totalStockIncrease: message.totalStockIncrease,
                totalStockDecline: message.totalStockDecline,
                totalStockNoChange: message.totalStockNoChange,
                totalStockCeiling: message.totalStockCeiling,
                totalStockFloor: message.totalStockFloor,
                estimatedChange: message.estimatedChange,
                estimatedFsp: message.estimatedFsp,
                time: message.time,
                messageType: 'index',
                sendingTime: message.time,
            };
            cacheManager.setMarketIndex(symbol, indexData);
        }
    }

    /**
     * Update symbols subscription
     * @param {Array} newSymbols - New array of symbols
     */
    updateSymbols(newSymbols) {
        // console.log(`[REALTIME] Updating symbols from ${this.symbols.length} to ${newSymbols.length}`);
        this.symbols = newSymbols;

        if (this.isConnected) {
            this.subscribeToSymbols();
        }
    }

    /**
     * Get connection status
     * @returns {Object} Connection status info
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            symbolsCount: this.symbols.length,
            socketId: this.socket?.id || null,
        };
    }

    /**
     * Cleanup and disconnect
     */
    cleanup() {
        // console.log('[REALTIME] Cleaning up realtime manager');

        if (this.socket) {
            this.socket.removeAllListeners();
            if (this.isConnected) {
                this.socket.disconnect();
            }
            this.socket = null;
        }

        this.isConnected = false;
        this.messageTypes = {};
        this.onUpdateCallback = null;
    }
}

module.exports = RealtimeManager;
