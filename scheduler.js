/**
 * Scheduler Service - Handles scheduled data refresh at specific times
 * Refreshes data at 4 AM and 7 AM every day
 */

const cron = require('node-cron');
const DataInitializer = require('./data-initializer');

class Scheduler {
    constructor() {
        this.dataInitializer = new DataInitializer();
        this.cronTasks = [];
        this.isRunning = false;
    }

    /**
     * Start the scheduler with cron jobs
     * Runs refresh at 4:00 AM and 7:00 AM every day
     */
    start() {
        console.log('[SCHEDULER] Starting data refresh scheduler...');

        try {
            // Schedule refresh at 4:00 AM every day
            const task4am = cron.schedule('0 4 * * *', async () => {
                await this.refreshData('4:00 AM');
            });
            this.cronTasks.push(task4am);
            console.log('[SCHEDULER] Scheduled data refresh at 4:00 AM daily');

            // Schedule refresh at 7:00 AM every day
            const task7am = cron.schedule('0 7 * * *', async () => {
                await this.refreshData('7:00 AM');
            });
            this.cronTasks.push(task7am);
            console.log('[SCHEDULER] Scheduled data refresh at 7:00 AM daily');

            this.isRunning = true;
            console.log('[SCHEDULER] Scheduler started successfully');
        } catch (error) {
            console.error('[SCHEDULER] Failed to start scheduler:', error);
            throw error;
        }
    }

    /**
     * Refresh all data from vietcap APIs
     * @param {string} timeLabel - Label for logging (e.g., "4:00 AM")
     */
    async refreshData(timeLabel) {
        console.log(`[SCHEDULER] Starting scheduled data refresh at ${timeLabel}...`);
        const startTime = Date.now();

        try {
            // Perform full data refresh
            await this.dataInitializer.initialize();

            const duration = Date.now() - startTime;
            console.log(`[SCHEDULER] Data refresh completed at ${timeLabel} in ${duration}ms`);
        } catch (error) {
            console.error(`[SCHEDULER] Failed to refresh data at ${timeLabel}:`, error);
            // Don't throw - continue running even if refresh fails
            // Log the error but don't crash the server
        }
    }

    /**
     * Stop the scheduler and clean up cron tasks
     */
    stop() {
        console.log('[SCHEDULER] Stopping scheduler...');

        this.cronTasks.forEach((task) => {
            task.stop();
        });

        this.cronTasks = [];
        this.isRunning = false;
        console.log('[SCHEDULER] Scheduler stopped');
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            tasksCount: this.cronTasks.length,
            scheduleTimes: ['4:00 AM', '7:00 AM'],
            timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
    }
}

module.exports = Scheduler;
