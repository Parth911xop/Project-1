/**
 * Port Coordinate Database
 * Provides lat/lon for major global ports
 */
const ports = {
    "mumbai": { lat: 18.94, lng: 72.83, name: "JNPT Mumbai, India" },
    "chennai": { lat: 13.08, lng: 80.27, name: "Chennai Port, India" },
    "kolkata": { lat: 22.57, lng: 88.36, name: "Kolkata Port, India" },
    "singapore": { lat: 1.35, lng: 103.81, name: "Port of Singapore" },
    "shanghai": { lat: 31.23, lng: 121.47, name: "Port of Shanghai, China" },
    "dubai": { lat: 25.20, lng: 55.27, name: "Jebel Ali, Dubai" },
    "london": { lat: 51.50, lng: -0.12, name: "Port of London, UK" },
    "new_york": { lat: 40.71, lng: -74.00, name: "Port of NY & NJ, USA" },
    "rotterdam": { lat: 51.92, lng: 4.47, name: "Port of Rotterdam, NL" },
    "los_angeles": { lat: 33.74, lng: -118.26, name: "Port of Los Angeles, USA" }
};

/**
 * Normalizes a port name to find its coordinates
 * @param {string} name 
 * @returns {Object|null} {lat, lng, name}
 */
function getPortCoordinates(name) {
    if (!name) return null;
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    // Direct match
    if (ports[key]) return ports[key];
    
    // Partial match
    for (const [k, v] of Object.entries(ports)) {
        if (name.toLowerCase().includes(k.replace(/_/g, ' '))) {
            return v;
        }
    }
    
    return null;
}

module.exports = { ports, getPortCoordinates };
