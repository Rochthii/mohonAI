/**
 * =====================================================================
 * MỎ HỖN AI - VERCEL SERVERLESS FUNCTION ENTRY POINT
 * =====================================================================
 * Bridges api/ (CommonJS context) with the main server logic.
 * Vercel loads this file as the serverless handler for all /api/* routes.
 */

// server.cjs is the single source of truth and entry point for backend.
// It uses .cjs extension so Node.js treats it as CommonJS regardless of root package.json "type": "module"
const app = require('../server.cjs');

module.exports = app;
