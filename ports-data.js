/**
 * 🌍 MASTER PORT DATABASE
 * Single source of truth for all port data
 * Used by: Frontend (wizard dropdown), Backend (coordinate resolver), Tracking (map)
 * 
 * RULE: Always store PORT_ID in database, NEVER store text names
 */
const PORTS = [
    // 🇺🇸 USA
    { id: "PORT_LA", name: "Port of Los Angeles", country: "USA", lat: 33.7361, lng: -118.2626 },
    { id: "PORT_LONG_BEACH", name: "Port of Long Beach", country: "USA", lat: 33.7542, lng: -118.2167 },
    { id: "PORT_NEW_YORK", name: "Port of New York & New Jersey", country: "USA", lat: 40.6681, lng: -74.0451 },
    { id: "PORT_HOUSTON", name: "Port of Houston", country: "USA", lat: 29.7300, lng: -95.2650 },

    // 🇨🇳 China
    { id: "PORT_SHANGHAI", name: "Port of Shanghai", country: "China", lat: 31.2304, lng: 121.4737 },
    { id: "PORT_SHENZHEN", name: "Port of Shenzhen", country: "China", lat: 22.5431, lng: 114.0579 },
    { id: "PORT_NINGBO", name: "Port of Ningbo-Zhoushan", country: "China", lat: 29.8683, lng: 121.5440 },
    { id: "PORT_GUANGZHOU", name: "Port of Guangzhou", country: "China", lat: 23.1291, lng: 113.2644 },

    // 🇸🇬 Singapore
    { id: "PORT_SINGAPORE", name: "Port of Singapore", country: "Singapore", lat: 1.2644, lng: 103.8200 },

    // 🇦🇪 UAE
    { id: "PORT_JEBEL_ALI", name: "Jebel Ali Port (Dubai)", country: "UAE", lat: 25.0657, lng: 55.1713 },

    // 🇮🇳 India
    { id: "PORT_MUMBAI", name: "Mumbai Port", country: "India", lat: 18.9488, lng: 72.8405 },
    { id: "PORT_NHAVA_SHEVA", name: "Jawaharlal Nehru Port (Nhava Sheva)", country: "India", lat: 18.9517, lng: 72.9497 },
    { id: "PORT_CHENNAI", name: "Chennai Port", country: "India", lat: 13.1067, lng: 80.3206 },
    { id: "PORT_KOLKATA", name: "Kolkata Port", country: "India", lat: 22.5726, lng: 88.3639 },
    { id: "PORT_KANDLA", name: "Kandla Port", country: "India", lat: 23.0333, lng: 70.2167 },

    // 🇳🇱 Netherlands
    { id: "PORT_ROTTERDAM", name: "Port of Rotterdam", country: "Netherlands", lat: 51.9244, lng: 4.4777 },

    // 🇧🇪 Belgium
    { id: "PORT_ANTWERP", name: "Port of Antwerp", country: "Belgium", lat: 51.2194, lng: 4.4025 },

    // 🇩🇪 Germany
    { id: "PORT_HAMBURG", name: "Port of Hamburg", country: "Germany", lat: 53.5511, lng: 9.9937 },

    // 🇬🇧 UK
    { id: "PORT_LONDON", name: "Port of London", country: "UK", lat: 51.5074, lng: -0.1278 },

    // 🇫🇷 France
    { id: "PORT_LE_HAVRE", name: "Port of Le Havre", country: "France", lat: 49.4944, lng: 0.1079 },

    // 🇪🇸 Spain
    { id: "PORT_VALENCIA", name: "Port of Valencia", country: "Spain", lat: 39.4699, lng: -0.3763 },

    // 🇮🇹 Italy
    { id: "PORT_GENOA", name: "Port of Genoa", country: "Italy", lat: 44.4056, lng: 8.9463 },

    // 🇯🇵 Japan
    { id: "PORT_TOKYO", name: "Port of Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
    { id: "PORT_YOKOHAMA", name: "Port of Yokohama", country: "Japan", lat: 35.4437, lng: 139.6380 },

    // 🇰🇷 South Korea
    { id: "PORT_BUSAN", name: "Port of Busan", country: "South Korea", lat: 35.1796, lng: 129.0756 },

    // 🇦🇺 Australia
    { id: "PORT_SYDNEY", name: "Port of Sydney", country: "Australia", lat: -33.8688, lng: 151.2093 },
    { id: "PORT_MELBOURNE", name: "Port of Melbourne", country: "Australia", lat: -37.8136, lng: 144.9631 },

    // 🇧🇷 Brazil
    { id: "PORT_SANTOS", name: "Port of Santos", country: "Brazil", lat: -23.9608, lng: -46.3336 },

    // 🇨🇦 Canada
    { id: "PORT_VANCOUVER", name: "Port of Vancouver", country: "Canada", lat: 49.2827, lng: -123.1207 },

    // 🇿🇦 South Africa
    { id: "PORT_DURBAN", name: "Port of Durban", country: "South Africa", lat: -29.8587, lng: 31.0218 },

    // 🇸🇦 Saudi Arabia
    { id: "PORT_JEDDAH", name: "Port of Jeddah", country: "Saudi Arabia", lat: 21.4858, lng: 39.1925 },

    // 🇪🇬 Egypt
    { id: "PORT_ALEXANDRIA", name: "Port of Alexandria", country: "Egypt", lat: 31.2001, lng: 29.9187 },

    // 🇹🇷 Turkey
    { id: "PORT_ISTANBUL", name: "Port of Istanbul", country: "Turkey", lat: 41.0082, lng: 28.9784 },

    // 🇹🇭 Thailand
    { id: "PORT_LAEM_CHABANG", name: "Laem Chabang Port", country: "Thailand", lat: 13.0827, lng: 100.8830 },

    // 🇮🇩 Indonesia
    { id: "PORT_JAKARTA", name: "Port of Jakarta", country: "Indonesia", lat: -6.2088, lng: 106.8456 },

    // 🇵🇭 Philippines
    { id: "PORT_MANILA", name: "Port of Manila", country: "Philippines", lat: 14.5995, lng: 120.9842 }
];

// ── HELPER FUNCTIONS ──────────────────────────────────────────
function getPortById(portId) {
    return PORTS.find(p => p.id === portId) || null;
}

function getPortCoordinates(portId) {
    const port = getPortById(portId);
    return port ? { lat: port.lat, lng: port.lng, name: port.name } : null;
}

function searchPorts(query) {
    if (!query) return PORTS;
    const q = query.toLowerCase();
    return PORTS.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.country.toLowerCase().includes(q) || 
        p.id.toLowerCase().includes(q)
    );
}

// ── EXPORT (works for both Node.js and Browser) ───────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PORTS, getPortById, getPortCoordinates, searchPorts };
} else {
    // Browser global
    window.PORTS_DATA = PORTS;
    window.getPortById = getPortById;
    window.getPortCoordinates = getPortCoordinates;
    window.searchPorts = searchPorts;
}
