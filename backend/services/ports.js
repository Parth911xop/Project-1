/**
 * Port Service — resolves PORT_IDs to coordinates
 * Uses the shared ports-data.js master file
 */
const { PORTS, getPortById, getPortCoordinates, searchPorts } = require('../../ports-data');

module.exports = { PORTS, getPortById, getPortCoordinates, searchPorts };
