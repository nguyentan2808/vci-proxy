/**
 * Broadcast Service - Manages client Socket.IO connections and broadcasts updates
 * Handles client subscriptions and broadcasts realtime updates to subscribed clients
 */

const { Server } = require('socket.io');

class BroadcastService {
    constructor() {
        this.io = null;
        this.clientSubscriptions = new Map(); // clientId -> Set of symbols
        this.symbolSubscribers = new Map();   // symbol -> Set of clientIds
        this.connectedClients = new Map();    // clientId -> socket
    }

    /**
     * Initialize Socket.IO server
     * @param {Object} httpServer - HTTP server instance
     */
    initialize(httpServer) {
        // console.log('[BROADCAST] Initializing Socket.IO server...');
        
        this.io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            path: '/ws/price/socket.io'
        });

        this.setupEventHandlers();
        // console.log('[BROADCAST] Socket.IO server initialized');
    }

    /**
     * Setup Socket.IO event handlers
     */
    setupEventHandlers() {
        if (!this.io) return;

        this.io.on('connection', (socket) => {
            // console.log(`[BROADCAST] Client connected: ${socket.id}`);
            this.connectedClients.set(socket.id, socket);

            // Handle subscription to symbols
            socket.on('match-price', (data) => {
                this.handleSubscription(socket.id, 'match-price', data);
            });

            socket.on('bid-ask', (data) => {
                this.handleSubscription(socket.id, 'bid-ask', data);
            });

            // Handle unsubscription
            socket.on('unsubscribe-match-price', (data) => {
                this.handleUnsubscription(socket.id, 'match-price', data);
            });

            socket.on('unsubscribe-bid-ask', (data) => {
                this.handleUnsubscription(socket.id, 'bid-ask', data);
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                this.handleDisconnection(socket.id);
            });

            // Handle errors
            socket.on('error', (error) => {
                console.error(`[BROADCAST] Client ${socket.id} error:`, error);
            });
        });
    }

    /**
     * Handle client subscription to symbols
     * @param {string} clientId - Client socket ID
     * @param {string} eventType - Event type ('match-price' or 'bid-ask')
     * @param {string} data - JSON string containing symbols array
     */
    handleSubscription(clientId, eventType, data) {
        try {
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
            const symbols = parsedData.symbols || [];

            if (!Array.isArray(symbols)) {
                console.warn(`[BROADCAST] Invalid symbols format from client ${clientId}`);
                return;
            }

            // Initialize client subscriptions if not exists
            if (!this.clientSubscriptions.has(clientId)) {
                this.clientSubscriptions.set(clientId, new Set());
            }

            // Add symbols to client's subscription
            const clientSymbols = this.clientSubscriptions.get(clientId);
            symbols.forEach(symbol => {
                clientSymbols.add(symbol);

                // Add client to symbol's subscriber list
                if (!this.symbolSubscribers.has(symbol)) {
                    this.symbolSubscribers.set(symbol, new Set());
                }
                this.symbolSubscribers.get(symbol).add(clientId);
            });

            // console.log(`[BROADCAST] Client ${clientId} subscribed to ${symbols.length} symbols for ${eventType}`);
            // console.log(`[BROADCAST] Total clients: ${this.connectedClients.size}, Total symbols tracked: ${this.symbolSubscribers.size}`);

        } catch (error) {
            console.error(`[BROADCAST] Error handling subscription from client ${clientId}:`, error);
        }
    }

    /**
     * Handle client unsubscription from symbols
     * @param {string} clientId - Client socket ID
     * @param {string} eventType - Event type ('match-price' or 'bid-ask')
     * @param {string} data - JSON string containing symbols array
     */
    handleUnsubscription(clientId, eventType, data) {
        try {
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
            const symbols = parsedData.symbols || [];

            if (!Array.isArray(symbols)) {
                console.warn(`[BROADCAST] Invalid symbols format from client ${clientId}`);
                return;
            }

            const clientSymbols = this.clientSubscriptions.get(clientId);
            if (!clientSymbols) return;

            // Remove symbols from client's subscription
            symbols.forEach(symbol => {
                clientSymbols.delete(symbol);

                // Remove client from symbol's subscriber list
                const symbolSubscribers = this.symbolSubscribers.get(symbol);
                if (symbolSubscribers) {
                    symbolSubscribers.delete(clientId);
                    
                    // Clean up empty symbol entries
                    if (symbolSubscribers.size === 0) {
                        this.symbolSubscribers.delete(symbol);
                    }
                }
            });

            // console.log(`[BROADCAST] Client ${clientId} unsubscribed from ${symbols.length} symbols for ${eventType}`);

        } catch (error) {
            console.error(`[BROADCAST] Error handling unsubscription from client ${clientId}:`, error);
        }
    }

    /**
     * Handle client disconnection
     * @param {string} clientId - Client socket ID
     */
    handleDisconnection(clientId) {
        // console.log(`[BROADCAST] Client disconnected: ${clientId}`);
        
        // Remove client from all symbol subscriptions
        const clientSymbols = this.clientSubscriptions.get(clientId);
        if (clientSymbols) {
            clientSymbols.forEach(symbol => {
                const symbolSubscribers = this.symbolSubscribers.get(symbol);
                if (symbolSubscribers) {
                    symbolSubscribers.delete(clientId);
                    
                    // Clean up empty symbol entries
                    if (symbolSubscribers.size === 0) {
                        this.symbolSubscribers.delete(symbol);
                    }
                }
            });
            
            this.clientSubscriptions.delete(clientId);
        }

        // Remove client from connected clients
        this.connectedClients.delete(clientId);
        
        // console.log(`[BROADCAST] Total clients: ${this.connectedClients.size}, Total symbols tracked: ${this.symbolSubscribers.size}`);
    }

    /**
     * Broadcast realtime update to subscribed clients
     * @param {string} symbol - Stock symbol
     * @param {string} eventType - Event type ('match-price', 'bid-ask', or 'index')
     * @param {Object} data - Update data
     */
    broadcastUpdate(symbol, eventType, data) {
        const subscribers = this.symbolSubscribers.get(symbol);
        if (!subscribers || subscribers.size === 0) {
            // console.log(`[BROADCAST] No subscribers for ${symbol}, skipping broadcast`);
            return; // No subscribers for this symbol
        }

        // Convert data to the same format as vietcap (protobuf binary)
        const binaryData = this.convertToBinaryData(data);

        // Broadcast to all subscribed clients
        let successCount = 0;
        let errorCount = 0;
        
        subscribers.forEach(clientId => {
            const socket = this.connectedClients.get(clientId);
            if (socket && socket.connected) {
                try {
                    socket.emit(eventType, binaryData);
                    successCount++;
                } catch (error) {
                    console.error(`[BROADCAST] Error sending to client ${clientId}:`, error);
                    errorCount++;
                }
            } else {
                console.warn(`[BROADCAST] Client ${clientId} not connected, skipping`);
                errorCount++;
            }
        });

        // console.log(`[BROADCAST] Broadcast ${eventType} for ${symbol} to ${successCount}/${subscribers.size} clients (${errorCount} errors)`);
    }

    /**
     * Convert data to binary format (simplified - in real implementation would use protobuf)
     * @param {Object} data - Data to convert
     * @returns {Buffer} Binary data
     */
    convertToBinaryData(data) {
        // For now, just return the data as-is
        // In a real implementation, this would encode the data using protobuf
        return Buffer.from(JSON.stringify(data));
    }

    /**
     * Broadcast to all connected clients
     * @param {string} eventType - Event type
     * @param {Object} data - Data to broadcast
     */
    broadcastToAll(eventType, data) {
        if (!this.io) return;

        const binaryData = this.convertToBinaryData(data);
        this.io.emit(eventType, binaryData);
    }

    /**
     * Get broadcast service statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            connectedClients: this.connectedClients.size,
            totalSubscriptions: this.clientSubscriptions.size,
            symbolsTracked: this.symbolSubscribers.size,
            totalSymbolSubscriptions: Array.from(this.symbolSubscribers.values())
                .reduce((total, subscribers) => total + subscribers.size, 0)
        };
    }

    /**
     * Get clients subscribed to a specific symbol
     * @param {string} symbol - Stock symbol
     * @returns {Array} Array of client IDs
     */
    getSubscribers(symbol) {
        const subscribers = this.symbolSubscribers.get(symbol);
        return subscribers ? Array.from(subscribers) : [];
    }

    /**
     * Cleanup and close Socket.IO server
     */
    cleanup() {
        // console.log('[BROADCAST] Cleaning up broadcast service');
        
        if (this.io) {
            this.io.close();
            this.io = null;
        }
        
        this.clientSubscriptions.clear();
        this.symbolSubscribers.clear();
        this.connectedClients.clear();
    }
}

module.exports = BroadcastService;
