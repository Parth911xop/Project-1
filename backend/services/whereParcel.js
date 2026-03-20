const axios = require("axios");

const API_KEY = "wp_live_tjk7ulP1rB1wm1OZyPSzQ5Eb3Uxc_DK_rYLofr6uA-g"; 

/**
 * Fetches tracking data from WhereParcel API
 * @param {string} trackingNumber 
 * @param {string} carrier - default 'auto'
 */
async function getExternalTracking(trackingNumber, carrier = "auto") {
    if (!trackingNumber) return null;
    
    try {
        const response = await axios.post(
            "https://api.whereparcel.com/v1/trackings",
            {
                tracking_number: trackingNumber,
                carrier: carrier 
            },
            {
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error("[WhereParcel API Error]:", error.response?.data || error.message);
        return null; // Return null if API fails so we can fallback to internal logs
    }
}

module.exports = { getExternalTracking };
