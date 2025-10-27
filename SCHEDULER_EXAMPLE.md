# Scheduler Usage Examples

## Server Startup with Scheduler

When you start the server, the scheduler automatically initializes:

```bash
$ npm start

[CONFIG] Server mode: cache (Cache mode: true)
[CONFIG] Initializing cache mode endpoints...
[SERVER] Starting Cache Server...
[SERVER] Step 1: Initializing data...
[INIT] Starting data initialization...
[CACHE] Initializing cache manager
[INIT] Loading all symbols metadata...
[INIT] Loaded 1724 symbols metadata
[INIT] Loading company listing info...
[INIT] Loaded 1581 companies
[INIT] Loading HOSE exchange data...
[INIT] Loaded 415 stock data entries for HOSE
[INIT] Loading HNX exchange data...
[INIT] Loaded 304 stock data entries for HNX
[INIT] Loading UPCOM exchange data...
[INIT] Loaded 882 stock data entries for UPCOM
[INIT] Loading VN30 exchange data...
[INIT] Loaded 30 stock data entries for VN30
[INIT] Loading HNX30 exchange data...
[INIT] Loaded 30 stock data entries for HNX30
[INIT] Loading market indexes...
[INIT] Loaded 5 market indexes
[INIT] Data initialization completed in 841ms
[SERVER] Step 2: Initializing broadcast service...
[SERVER] Step 3: Initializing realtime manager...
[SERVER] Realtime manager initialized successfully
[SERVER] Step 4: Initializing data refresh scheduler...
[SCHEDULER] Starting data refresh scheduler...
[SCHEDULER] Scheduled data refresh at 4:00 AM daily
[SCHEDULER] Scheduled data refresh at 7:00 AM daily
[SCHEDULER] Scheduler started successfully
[SERVER] Scheduler initialized successfully
[SERVER] Step 5: Starting HTTP server...
[SERVER] Cache Server running on port 3001
[SERVER] Health check: http://localhost:3001/health
```

## Scheduled Refresh Log Example

When the scheduler triggers at 4:00 AM:

```
2025-10-27T04:00:00.123Z [SCHEDULER] Starting scheduled data refresh at 4:00 AM...
[INIT] Starting data initialization...
[CACHE] Initializing cache manager
[INIT] Loading all symbols metadata...
[INIT] Loaded 1724 symbols metadata
[INIT] Loading company listing info...
[INIT] Loaded 1581 companies
[INIT] Loading HOSE exchange data...
[INIT] Found 415 symbols for HOSE
[CACHE] Updated 415 stock data entries
[INIT] Loaded 415 stock data entries for HOSE
[INIT] Loading HNX exchange data...
[INIT] Found 304 symbols for HNX
[CACHE] Updated 304 stock data entries
[INIT] Loaded 304 stock data entries for HNX
[INIT] Loading UPCOM exchange data...
[INIT] Found 882 symbols for UPCOM
[CACHE] Updated 882 stock data entries
[INIT] Loaded 882 stock data entries for UPCOM
[INIT] Loading VN30 exchange data...
[INIT] Found 30 symbols for VN30
[CACHE] Updated 30 stock data entries
[INIT] Loaded 30 stock data entries for VN30
[INIT] Loading HNX30 exchange data...
[INIT] Found 30 symbols for HNX30
[CACHE] Updated 30 stock data entries
[INIT] Loaded 30 stock data entries for HNX30
[INIT] Loading market indexes...
[CACHE] Updated 5 market indexes
[INIT] Loaded 5 market indexes
[INIT] Data initialization completed in 856ms
[INIT] Cache stats: {
  symbolsCount: 1724,
  stockDataCount: 1601,
  groupsCount: 5,
  marketIndexesCount: 5,
  companiesCount: 1581,
  lastUpdate: 2025-10-27T04:00:01.979Z,
  isInitialized: true
}
2025-10-27T04:00:01.980Z [SCHEDULER] Data refresh completed at 4:00 AM in 856ms
```

And again at 7:00 AM:

```
2025-10-27T07:00:00.234Z [SCHEDULER] Starting scheduled data refresh at 7:00 AM...
[INIT] Starting data initialization...
... (same refresh process) ...
2025-10-27T07:00:01.890Z [SCHEDULER] Data refresh completed at 7:00 AM in 890ms
```

## Checking Scheduler Status via API

### Health Endpoint

```bash
$ curl http://localhost:3001/health | jq '.scheduler'

{
  "isRunning": true,
  "tasksCount": 2,
  "scheduleTimes": [
    "4:00 AM",
    "7:00 AM"
  ],
  "timezone": "Asia/Saigon"
}
```

### Full Health Response Example

```bash
$ curl http://localhost:3001/health | jq '.'

{
  "status": "OK",
  "message": "CACHE Server is running",
  "mode": "cache",
  "cacheMode": true,
  "cache": {
    "ready": true,
    "stats": {
      "symbolsCount": 1724,
      "stockDataCount": 1601,
      "groupsCount": 5,
      "marketIndexesCount": 5,
      "companiesCount": 1581,
      "lastUpdate": "2025-10-27T04:00:01.979Z",
      "isInitialized": true
    }
  },
  "realtime": {
    "isConnected": true,
    "reconnectAttempts": 0,
    "symbolsCount": 1606,
    "socketId": "NZ7-oAnLAXC13bCvAgHR"
  },
  "broadcast": {
    "connectedClients": 1,
    "totalSubscriptions": 50,
    "symbolsTracked": 45,
    "totalSymbolSubscriptions": 98
  },
  "scheduler": {
    "isRunning": true,
    "tasksCount": 2,
    "scheduleTimes": [
      "4:00 AM",
      "7:00 AM"
    ],
    "timezone": "Asia/Saigon"
  }
}
```

## Server Graceful Shutdown

When stopping the server (Ctrl+C):

```bash
^C
[SERVER] Shutting down gracefully...
[SCHEDULER] Stopping scheduler...
[SCHEDULER] Scheduler stopped
[SERVER] Server closed
```

The scheduler cleanly stops all cron jobs before the server exits.

## Error Handling Example

If a refresh fails (e.g., network timeout):

```
2025-10-27T04:00:00.123Z [SCHEDULER] Starting scheduled data refresh at 4:00 AM...
[INIT] Starting data initialization...
[INIT] Loading all symbols metadata...
[AXIOS] Error: Network timeout
[SCHEDULER] Failed to refresh data at 4:00 AM: Network timeout
```

**Important:** The server continues running and the next refresh is still scheduled for 7:00 AM. The previous cache remains available for serving requests.

## Monitoring Refresh Performance

Check refresh duration in logs:

```bash
# Each refresh line contains timing information:
[SCHEDULER] Data refresh completed at 4:00 AM in 856ms
[SCHEDULER] Data refresh completed at 7:00 AM in 890ms

# Typical refresh times: 800-1000ms
# This is non-blocking and doesn't affect API response times
```

## Configuration Example

To change refresh times to 2:00 AM and 5:00 AM:

Edit `scheduler.js`:

```javascript
// Schedule refresh at 2:00 AM every day
const task2am = cron.schedule('0 2 * * *', async () => {
    await this.refreshData('2:00 AM');
});
this.cronTasks.push(task2am);
console.log('[SCHEDULER] Scheduled data refresh at 2:00 AM daily');

// Schedule refresh at 5:00 AM every day
const task5am = cron.schedule('0 5 * * *', async () => {
    await this.refreshData('5:00 AM');
});
this.cronTasks.push(task5am);
console.log('[SCHEDULER] Scheduled data refresh at 5:00 AM daily');
```

Then restart the server:

```bash
npm start
# Output will show:
# [SCHEDULER] Scheduled data refresh at 2:00 AM daily
# [SCHEDULER] Scheduled data refresh at 5:00 AM daily
```

## Setting Timezone

To use a specific timezone for refresh scheduling:

```bash
# Option 1: Set environment variable before starting
export TZ='Asia/Ho_Chi_Minh'
npm start

# Option 2: Run with environment variable
TZ='America/New_York' npm start

# Option 3: Check what timezone is being used
curl http://localhost:3001/health | jq '.scheduler.timezone'
# Output: "Asia/Saigon"
```

## Real-World Scenario

Here's a typical day with the scheduler:

```
Morning:
[Time] Server started at 2:30 AM
[2:30 AM] Initial data load completes
[2:30 AM] Scheduler activated: Awaiting next refresh

[4:00 AM] First scheduled refresh starts
[4:00 AM] All market data refreshed (856ms)
[4:00 AM] Scheduler awaiting next refresh

[5:00 AM - 3:59 PM] Normal operation
- API requests serve fresh cached data
- Real-time WebSocket updates continue
- No service interruption

[7:00 AM] Second scheduled refresh starts
[7:00 AM] All market data refreshed (890ms)
[7:00 AM] Scheduler awaiting next refresh

[3:59 PM - 3:59 AM next day] Normal operation continues

[4:00 AM next day] Third scheduled refresh
(cycle repeats)
```

The scheduler ensures your price board always has current data without manual intervention!
