const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = function (pool, createNotification) {

    // Helper for notifications
    const notify = async (userId, title, message, type = 'info') => {
        try {
            await createNotification(userId, type, title, message, '/profile.html');
        } catch (e) { console.error('KYC Notification error:', e); }
    };

    const uploadDir = path.join(__dirname, 'uploads', 'kyc');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
            const uid = req.user?.userId || req.user?.id || 'unknown';
            cb(null, `kyc-${uid}-${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
        }
    });

    const upload = multer({ storage: storage });

    // Upload KYC Document with Enhanced Error Handler
    router.post('/upload', (req, res) => {
        upload.single('kycFile')(req, res, async (err) => {
            if (err instanceof multer.MulterError) {
                console.error("🔥 Multer Error:", err);
                return res.status(400).json({ success: false, message: `Upload error: ${err.message}. Ensure the field name is 'kycFile'.` });
            } else if (err) {
                console.error("🔥 General Upload Error:", err);
                return res.status(500).json({ success: false, message: 'Server file system error: ' + err.message });
            }

            const docType = req.body.docType || req.body.type;
            const userId = req.user.userId;

            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file received. Please select an image or PDF.' });
            }

            try {
                const fileUrl = `/uploads/kyc/${req.file.filename}`;
                
                await pool.query(
                    `INSERT INTO user_kyc_documents (user_id, doc_type, file_name, file_url, status, updated_at)
                     VALUES ($1, $2, $3, $4, 'Pending', NOW())
                     ON CONFLICT (user_id, doc_type) 
                     DO UPDATE SET file_name = EXCLUDED.file_name, file_url = EXCLUDED.file_url, status = 'Pending', updated_at = NOW()`,
                    [userId, docType, req.file.originalname, fileUrl]
                );

                const userRes = await pool.query('SELECT kyc_status FROM users WHERE id = $1', [userId]);
                if (userRes.rows[0].kyc_status !== 'Approved') {
                    await pool.query("UPDATE users SET kyc_status = 'Pending' WHERE id = $1", [userId]);
                }

                res.json({ success: true, message: `${docType} uploaded successfully.`, fileUrl, fileName: req.file.originalname });
            } catch (err) {
                console.error('🔥 DB Save Error:', err);
                res.status(500).json({ success: false, message: 'Failed to save file info to database: ' + err.message });
            }
        });
    });

    router.get('/my-status', async (req, res) => {
        const userId = req.user.userId;
        try {
            const userRes = await pool.query('SELECT kyc_status FROM users WHERE id = $1', [userId]);
            const docsRes = await pool.query('SELECT doc_type, status, rejection_reason, file_name, file_url, updated_at FROM user_kyc_documents WHERE user_id = $1', [userId]);
            
            res.json({
                success: true,
                kycStatus: userRes.rows[0].kyc_status,
                documents: docsRes.rows
            });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Failed to fetch KYC status' });
        }
    });

    router.get('/admin/pending', async (req, res) => {
        try {
            const resDocs = await pool.query(
                `SELECT d.*, u.name, u.email 
                 FROM user_kyc_documents d
                 JOIN users u ON d.user_id = u.id
                 WHERE d.status = 'Pending'
                 ORDER BY d.updated_at ASC`
            );
            res.json({ success: true, pendingRequests: resDocs.rows });
        } catch (err) {
            res.status(500).json({ success: false, message: 'Failed to fetch pending requests' });
        }
    });

    router.post('/admin/verify', async (req, res) => {
        const { id, status, reason } = req.body;
        try {
            const docRes = await pool.query('UPDATE user_kyc_documents SET status = $1, rejection_reason = $2 WHERE id = $3 RETURNING user_id, doc_type', [status, reason || '', id]);
            
            if (docRes.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Document request not found' });
            }

            const { user_id, doc_type } = docRes.rows[0];

            const notifMsg = status === 'Approved' 
                ? `Your ${doc_type} has been approved.` 
                : `Your ${doc_type} was rejected. Reason: ${reason}`;
            await notify(user_id, 'KYC Document Update', notifMsg, status === 'Approved' ? 'success' : 'error');

            const allDocs = await pool.query('SELECT status FROM user_kyc_documents WHERE user_id = $1', [user_id]);
            const approvedCount = allDocs.rows.filter(d => d.status === 'Approved').length;
            const requiredCount = 3; 

            if (status === 'Approved' && approvedCount >= requiredCount) {
                await pool.query("UPDATE users SET kyc_status = 'Approved' WHERE id = $1", [user_id]);
                await notify(user_id, 'KYC Fully Verified!', 'Your identity is verified. You can now book unlimited shipments.', 'success');
            } else if (status === 'Rejected') {
                await pool.query("UPDATE users SET kyc_status = 'Rejected' WHERE id = $1", [user_id]);
            }

            res.json({ success: true, message: `Document ${status}` });
        } catch (err) {
            console.error('Verify error:', err);
            res.status(500).json({ success: false, message: 'Failed to update verification status' });
        }
    });

    return router;
};
