const express = require('express');

module.exports = (pool) => {
    const router = express.Router();

    // Helper function to create a notification (can be imported in other routes)
    const createNotification = async (userId, type, title, message, link = '') => {
        try {
            await pool.query(
                `INSERT INTO notifications (user_id, type, title, message, link)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, type, title, message, link]
            );
            return true;
        } catch (err) {
            console.error('[NOTIFICATIONS] Error creating:', err);
            return false;
        }
    };

    // 1. Get user's notifications
    router.get('/', async (req, res) => {
        const userId = req.user.userId;
        try {
            const result = await pool.query(
                `SELECT * FROM notifications 
                 WHERE user_id = $1 
                 ORDER BY created_at DESC LIMIT 50`,
                [userId]
            );
            res.json({ success: true, notifications: result.rows });
        } catch (err) {
            console.error('[NOTIFICATIONS] Fetch Error:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
        }
    });

    // 2. Mark as read
    router.post('/read', async (req, res) => {
        const userId = req.user.userId;
        const { notificationId } = req.body;
        try {
            await pool.query(
                `UPDATE notifications SET is_read = true 
                 WHERE id = $1 AND user_id = $2`,
                [notificationId, userId]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false });
        }
    });

    // 3. Mark all as read
    router.post('/read-all', async (req, res) => {
        const userId = req.user.userId;
        try {
            await pool.query(
                `UPDATE notifications SET is_read = true WHERE user_id = $1`,
                [userId]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false });
        }
    });

    return { router, createNotification };
};
