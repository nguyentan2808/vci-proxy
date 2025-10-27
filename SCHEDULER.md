# Data Refresh Scheduler

## Overview

The Scheduler service automatically refreshes all market data at **4:00 AM** and **7:00 AM** every day. This ensures that symbol metadata, company information, stock data, and market indexes remain up-to-date without requiring manual server restarts.

## Features

- ✅ **Automatic Daily Refresh**: Scheduled at 4:00 AM and 7:00 AM every day
- ✅ **No Server Downtime**: Refreshes happen while the server continues serving requests
- ✅ **Graceful Error Handling**: If a refresh fails, the scheduler continues running
- ✅ **Comprehensive Logging**: All refresh activities are logged with timestamps and durations
- ✅ **Status Monitoring**: Health check endpoint includes scheduler status

## How It Works

### Scheduling

The scheduler uses [node-cron](https://www.npmjs.com/package/node-cron) library to run tasks at specific times using cron syntax:

```javascript
// 4:00 AM every day
'0 4 * * *'

// 7:00 AM every day
'0 7 * * *'
```

### Refresh Process

When a scheduled time is reached, the scheduler performs a full data initialization:

1. **Load Symbols Metadata** - Fetches all available symbols from vietcap
2. **Load Companies** - Fetches company listing info via GraphQL
3. **Load Exchange Data** - Loads stock data for HOSE, HNX, UPCOM, VN30, HNX30
4. **Load Market Indexes** - Fetches VNINDEX, VN30, HNX30, and other market indexes

All data is updated in the in-memory cache, and realtime updates continue uninterrupted.

## Monitoring

### Health Check Endpoint

Check the scheduler status via the health endpoint:

```bash
curl http://localhost:3001/health
```

Response includes scheduler status:

```json
{
  "scheduler": {
    "isRunning": true,
    "tasksCount": 2,
    "scheduleTimes": ["4:00 AM", "7:00 AM"],
    "timezone": "Asia/Saigon"
  }
}
```

### Server Logs

Monitor refresh activities in the server logs:

```
[SCHEDULER] Starting scheduled data refresh at 4:00 AM...
[INIT] Starting data initialization...
[INIT] Loaded 1724 symbols metadata
[INIT] Loaded 1581 companies
[INIT] Loaded 415 stock data entries for HOSE
...
[SCHEDULER] Data refresh completed at 4:00 AM in 842ms
```

## Configuration

### Changing Refresh Times

To modify the refresh schedule, edit `scheduler.js` and update the cron expressions:

```javascript
// Schedule refresh at 2:00 AM and 6:00 AM instead
const task2am = cron.schedule('0 2 * * *', async () => {
    await this.refreshData('2:00 AM');
});

const task6am = cron.schedule('0 6 * * *', async () => {
    await this.refreshData('6:00 AM');
});
```

### Timezone

The scheduler respects the server's timezone. To set a specific timezone:

```bash
# On Linux/macOS
TZ='Asia/Ho_Chi_Minh' npm start

# Or set in .env file
export TZ='Asia/Ho_Chi_Minh'
```

Current timezone is detected from:
1. `process.env.TZ` environment variable
2. System default timezone

## Performance Considerations

**Benefits:**
- ✅ Symbol metadata stays current (new stocks, delistings)
- ✅ Company information is updated
- ✅ Reduces stale data issues
- ✅ No impact on realtime price updates

**Optimization:**
- The refresh uses the same efficient data loading mechanisms as startup
- Refresh operations don't block API requests
- WebSocket connections remain active during refresh
- Cached data is atomically updated

## Error Handling

If a scheduled refresh fails:

1. **Error is logged** with full stack trace
2. **Server continues running** - no service interruption
3. **Next refresh still scheduled** - automatic recovery
4. **Fallback to existing cache** - last known good data remains available

Example error handling:

```
[SCHEDULER] Failed to refresh data at 4:00 AM: Network timeout
[SCHEDULER] Scheduler will retry at 7:00 AM
```

## File Structure

```
proxy-server/
├── server.js              # Main server (initializes scheduler)
├── scheduler.js           # Scheduler service (NEW)
├── data-initializer.js    # Data loading logic
├── cache-manager.js       # Cache operations
├── realtime-manager.js    # WebSocket realtime updates
└── package.json           # Dependencies (includes node-cron)
```

## Dependencies

```json
{
  "dependencies": {
    "node-cron": "^3.0.0"  // Cron job scheduling
  }
}
```

## Shutdown

When the server shuts down gracefully (SIGINT), the scheduler stops cleanly:

```
^C[SERVER] Shutting down gracefully...
[SCHEDULER] Stopping scheduler...
[SCHEDULER] Scheduler stopped
[SERVER] Server closed
```

## Troubleshooting

### Scheduler not running?

1. Check if scheduler was initialized successfully in startup logs:
   ```
   [SERVER] Step 4: Initializing data refresh scheduler...
   [SCHEDULER] Starting data refresh scheduler...
   [SCHEDULER] Scheduler started successfully
   ```

2. Verify via health endpoint:
   ```bash
   curl http://localhost:3001/health | jq '.scheduler.isRunning'
   # Should return: true
   ```

### Refresh not happening at expected time?

1. Check server timezone:
   ```bash
   curl http://localhost:3001/health | jq '.scheduler.timezone'
   ```

2. Verify the refresh is scheduled:
   ```bash
   curl http://localhost:3001/health | jq '.scheduler.scheduleTimes'
   # Should return: ["4:00 AM", "7:00 AM"]
   ```

3. Check server logs during scheduled time for refresh logs

### Refresh is taking too long?

1. Monitor the refresh duration in logs:
   ```
   [SCHEDULER] Data refresh completed at 4:00 AM in 842ms
   ```

2. If consistently slow, check:
   - Network connectivity to vietcap APIs
   - Server CPU/memory usage
   - Consider adjusting refresh times to off-peak hours

## Future Enhancements

Potential improvements:

- Add manual refresh endpoint (POST /admin/refresh)
- Add refresh frequency configuration
- Add selective refresh (only certain exchanges)
- Add cache versioning and rollback capability
- Add refresh success/failure metrics to monitoring
