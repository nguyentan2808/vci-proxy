# Socket Reconnection Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser/App)                           │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Socket.IO Client Library                                        │  │
│  │  • Auto-reconnect enabled (default)                              │  │
│  │  • Exponential backoff: 1s, 2s, 4s, 8s...                       │  │
│  │  • Maintains connection state                                    │  │
│  │  • Automatic resubscription on reconnect                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  ↓                                      │
│                          Network (WiFi/4G/etc)                          │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↕
                          ws://localhost:3001/ws/price/socket.io
                                  ↕
┌─────────────────────────────────────────────────────────────────────────┐
│                        PROXY SERVER (Node.js)                           │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ BroadcastService (Manages Client Connections)                   │  │
│  │                                                                  │  │
│  │  • Socket.IO Server listening on port 3001                      │  │
│  │  • Tracks connected clients in Map                              │  │
│  │  • Handles client subscriptions (match-price, bid-ask)          │  │
│  │  • Handles client disconnections → cleanup                      │  │
│  │  • ✅ NO explicit reconnection needed (client-side handled)     │  │
│  │                                                                  │  │
│  │  Events:                                                         │  │
│  │    • 'connection'              → Track client                   │  │
│  │    • 'match-price' (subscribe) → Track subscription             │  │
│  │    • 'bid-ask' (subscribe)     → Track subscription             │  │
│  │    • 'disconnect'              → Cleanup subscriptions          │  │
│  │    • 'error'                   → Log error                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  ↕                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ RealtimeManager (Server → Vietcap Connection)                   │  │
│  │                                                                  │  │
│  │  • Socket.IO Client connecting to vietcap upstream              │  │
│  │  • ✅ AUTO-RECONNECTION ENABLED                                │  │
│  │  • Configuration:                                               │  │
│  │    - reconnection: true                                         │  │
│  │    - reconnectionAttempts: 5                                    │  │
│  │    - reconnectionDelay: 1000ms                                  │  │
│  │                                                                  │  │
│  │  Connection Status Tracking:                                    │  │
│  │    • isConnected (boolean)                                      │  │
│  │    • reconnectAttempts (counter)                                │  │
│  │    • maxReconnectAttempts (limit)                               │  │
│  │                                                                  │  │
│  │  Events with Reconnection Logic:                                │  │
│  │    • 'connect'              → isConnected=true, reset attempts, │  │
│  │                                subscribeToSymbols() ✅          │  │
│  │    • 'disconnect'           → isConnected=false, wait for auto  │  │
│  │                                reconnect                        │  │
│  │    • 'connect_error'        → increment attempts, log error,    │  │
│  │                                retry (if < 5) ✅                │  │
│  │    • 'reconnect'            → Log successful reconnection ✅    │  │
│  │    • 'reconnect_error'      → Log reconnection failure ✅       │  │
│  │                                                                  │  │
│  │  Message Handlers:                                              │  │
│  │    • 'match-price' → Decode protobuf, update cache,            │  │
│  │                      broadcast to subscribed clients            │  │
│  │    • 'bid-ask'     → Decode protobuf, update cache,            │  │
│  │                      broadcast to subscribed clients            │  │
│  │    • 'index'       → Decode protobuf, update market indexes,   │  │
│  │                      broadcast to subscribed clients            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                  ↓                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ CacheManager (In-Memory Data Store)                             │  │
│  │                                                                  │  │
│  │  • Stores 1,600+ symbols                                        │  │
│  │  • Stores 1,581 companies                                       │  │
│  │  • Stores stock data for 5 exchanges                            │  │
│  │  • Stores 5 market indexes                                      │  │
│  │  • Updated by RealtimeManager on each message                   │  │
│  │  • Served to clients via REST API (even if realtime down)       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                  ↓
                          Network (Firewall/ISP/etc)
                                  ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    VIETCAP SERVER (Upstream)                            │
│                  https://trading.vietcap.com.vn                        │
│                                                                         │
│  • WebSocket endpoint for real-time price updates                      │
│  • Sends protobuf-encoded messages                                     │
│  • Expects subscription messages in JSON format                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Reconnection State Machine (RealtimeManager)

```
                              DISCONNECTED
                               (isConnected=false)
                                     ↑
                                     │
                      ┌──────────────┼──────────────┐
                      │              │              │
                      │              │              │
                 (max retries)  (auto retry)    (manual)
                      │              │              │
                      │              ↓              │
                      │         CONNECTING          │
                      │         (attempting         │
                      │          connection)        │
                      │              │              │
                      │              ↓              │
                      │         ┌────────┐          │
                      │         │Success?│          │
                      │         └────────┘          │
                      │           / │ \             │
                     Yes         No/ │ \ Yes        │
                      │          /  │  \            │
                      │         ↓   │   ↓           │
                      ├────→ Error  └→ CONNECTED   │
                      │      Counter   (isConnected ├─→ subscribeToSymbols()
                      │      Increment =true)       │    ↓
                      │      │                      │    SUBSCRIBED
                      │      ↓                      │    (receiving updates)
                      │   Retry?                    │
                      │   (< 5)                     │
                      │      │                      │
                      │      ├─→ Yes → CONNECTING  │
                      │      │                      │
                      └──────┴─→ No → DISCONNECTED─┤
                                      (give up)    │
                                                   │
                                    ┌──────────────┘
                                    │
                          (network issue)
                                    │
                                    ↓
                            DISCONNECTED
```

## Reconnection Timeline Scenarios

### Scenario A: Successful Reconnection
```
Time   Event                          Status              Action
────────────────────────────────────────────────────────────────────
T+0s   Connection Lost               isConnected=false   Start retry timer
T+1s   Retry Attempt 1 Failed        Attempt 1/5         Wait 1s
T+2s   Retry Attempt 2 Failed        Attempt 2/5         Wait 1s
T+3s   Retry Attempt 3 SUCCEEDS      isConnected=true    subscribeToSymbols()
T+4s   Subscriptions Sent            Receiving updates   Resume broadcasts

Total downtime: 4 seconds
Client impact: Updates resume after 4 seconds
```

### Scenario B: Extended Outage
```
Time   Event                          Status              Action
────────────────────────────────────────────────────────────────────
T+0s   Connection Lost               isConnected=false   Start retry timer
T+1s   Retry Attempt 1 Failed        Attempt 1/5         Wait 1s
T+2s   Retry Attempt 2 Failed        Attempt 2/5         Wait 1s
T+3s   Retry Attempt 3 Failed        Attempt 3/5         Wait 1s
T+4s   Retry Attempt 4 Failed        Attempt 4/5         Wait 1s
T+5s   Retry Attempt 5 Failed        Attempt 5/5         GIVE UP
T+6s   [REALTIME] Max retries        isConnected=false   Serve cached data
       reached                        reconnectAttempts=5

Total downtime: INDEFINITE (until server comes back)
Client impact: Cached data served, real-time updates paused
              Resumes when vietcap connection restored
```

### Scenario C: Client Network Issue
```
Time   Event                          Server State        Client State
────────────────────────────────────────────────────────────────────
T+0s   WiFi Disconnected             connectedClients=   Socket
                                      {client123}         disconnected

T+0.5s disconnect event               →handleDisconnection →client
       Client removed from maps       client123 removed   reconnecting
                                      clientSubscriptions
                                      updated

T+5s   WiFi Reconnected              connectedClients=   Socket
       (Socket.IO auto-reconnect)    {client456}(new)    reconnected

T+5.1s Client re-emits               clientSubscriptions →Receiving
       subscriptions                 updated             updates

T+5.2s Broadcasting updates          Broadcasting to     Updates
       resumed                        client456           flowing
```

## Code Flow: Reconnection Event Handling

### When Connection is Lost

```javascript
// realtime-manager.js line 113-116
socket.on('disconnect', (reason) => {
    this.isConnected = false;
    // Socket.IO automatically triggers reconnection attempts
    // (because reconnection: true in config)
});
```

↓ Socket.IO internally attempts reconnection (no code needed)

### On Reconnection Attempt

```javascript
// realtime-manager.js line 118-125
socket.on('connect_error', (error) => {
    this.reconnectAttempts++;
    console.error(`Connection attempt ${this.reconnectAttempts} failed`);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
    }
    // Socket.IO will retry again automatically
});
```

↓ If connection succeeded instead

### On Successful Reconnection

```javascript
// realtime-manager.js line 106-111
socket.on('connect', () => {
    this.isConnected = true;
    this.reconnectAttempts = 0;  // ← Reset counter
    this.subscribeToSymbols();   // ← Re-subscribe ✅

    // Now receiving updates again
});
```

## Key Implementation Files

| File | Component | Reconnection Role |
|------|-----------|-------------------|
| `realtime-manager.js:88-94` | Socket.IO config | Enables auto-reconnect |
| `realtime-manager.js:106-125` | Event handlers | Handles reconnection logic |
| `realtime-manager.js:144-162` | subscribeToSymbols() | Resubscribes on reconnect |
| `broadcast-service.js:42-73` | Client handler | Cleans up on disconnect |
| `server.js:510-520` | Initialization | Sets up realtime manager |

## Network Conditions Handled

| Condition | Detection | Recovery | Time |
|-----------|-----------|----------|------|
| Brief blip (< 1s) | disconnect event | Reconnect attempt 1 | ~1s |
| Network down (5-10s) | disconnect event | Reconnect attempt 1-5 | ~5-10s |
| Server down | connect_error × 5 | Give up, serve cache | ~5s |
| Client WiFi drop | disconnect event | Client reconnects | Client-side |
| Client browser close | disconnect event | Cleanup happens | Immediate |

## Monitoring Reconnection Health

```javascript
// Check via /health endpoint
GET /health

// Response includes realtime status
{
  "realtime": {
    "isConnected": true,
    "reconnectAttempts": 0,
    "symbolsCount": 1606,
    "socketId": "NZ7-oAnLAXC13bCvAgHR"
  }
}

// Interpretation:
// isConnected: true + attempts: 0   → ✅ Healthy
// isConnected: false + attempts: 1-4 → ⚠️ Reconnecting
// isConnected: false + attempts: 5   → ❌ Max retries, serving cache
```

## Summary

**Your socket reconnection architecture is:**
- ✅ **Robust** - Handles multiple failure scenarios
- ✅ **Automatic** - No manual intervention needed
- ✅ **Resilient** - Falls back to cached data
- ✅ **Observable** - Logs and health endpoint visibility
- ✅ **Production-Ready** - Proper error handling and recovery

The system can survive network issues ranging from brief blips to extended outages while maintaining service availability through cached data.
