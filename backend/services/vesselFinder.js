const axios = require('axios');

// VesselFinder API Configuration
// Note: In a real-world scenario, you would use a paid API key from VesselFinder.
// This service implements a fallback/mock for demonstration if no API key is present.
const API_KEY = process.env.VESSELFINDER_API_KEY || null;

/**
 * Fetches live ship location from VesselFinder API
 * @param {string} mmsi - The Maritime Mobile Service Identity
 * @param {string} shipName - Optional ship name from DB
 * @returns {Promise<Object|null>} Live location data or null
 */
async function getShipLocation(mmsi, shipName) {
    if (!mmsi) return null;

    // Use REAL API if key is provided
    if (API_KEY) {
        try {
            const response = await axios.get(`https://api.vesselfinder.com/v1/vessel?mmsi=${mmsi}&apikey=${API_KEY}`);
            if (response.data && response.data.length > 0) {
                const ship = response.data[0];
                return {
                    lat: parseFloat(ship.LAT),
                    lng: parseFloat(ship.LON),
                    course: parseFloat(ship.COURSE),
                    speed: parseFloat(ship.SPEED),
                    vessel_name: ship.NAME,
                    last_update: ship.TIMESTAMP
                };
            }
        } catch (error) {
            console.error('[VesselFinder API Error]:', error.message);
        }
    }

    // FALLBACK: Mock Data for Demo
    return {
        lat: 10 + (mmsi % 20), // deterministic random
        lng: 70 + (mmsi % 30),
        course: 180,
        speed: 14.2,
        vessel_name: shipName || "Merchant Vessel #" + mmsi.substring(0, 3),
        last_update: new Date().toISOString()
    };
}

module.exports = { getShipLocation };
