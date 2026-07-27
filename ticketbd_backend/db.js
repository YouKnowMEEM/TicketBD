const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'ticketbd',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ============================================================
// LIVE SQL QUERY LOGGING
// ------------------------------------------------------------
// This is a database-design project, so the actual SQL matters for
// grading/demo -- not just the UI. Everything below prints every
// query TicketBD runs against MySQL to the terminal, with its
// parameters and how long it took, the moment it runs. Nothing in
// server.js needs to change for this to work: it wraps pool.query()
// and pool.getConnection() once, here, so every existing call site
// (plain queries AND the ones inside transactions) gets logged
// automatically.
//
// Turn it off for a quieter terminal by adding SHOW_SQL=false to .env.
// ============================================================
const SHOW_SQL = process.env.SHOW_SQL !== 'false';
let queryCount = 0;

function logQuery(sql, params, ms) {
    if (!SHOW_SQL) return;
    queryCount += 1;
    const oneLine = sql.replace(/\s+/g, ' ').trim();
    console.log(`\n[SQL #${queryCount}] (${ms}ms)`);
    console.log(oneLine);
    if (params !== undefined && params !== null && (!Array.isArray(params) || params.length)) {
        console.log('params:', params);
    }
}

async function loggedQuery(rawQueryFn, sql, params) {
    const start = Date.now();
    const result = await rawQueryFn(sql, params);
    logQuery(sql, params, Date.now() - start);
    return result;
}

// Wrap direct pool.query(...) calls (used for anything outside a transaction).
const rawPoolQuery = pool.query.bind(pool);
pool.query = (sql, params) => loggedQuery(rawPoolQuery, sql, params);

// Wrap pool.getConnection() so queries run inside a transaction (checkout,
// cancel-ticket, my-tickets) are logged too, plus mark transaction
// boundaries explicitly -- handy for demonstrating atomicity/ACID behavior.
const rawGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async () => {
    const connection = await rawGetConnection();

    const rawConnQuery = connection.query.bind(connection);
    connection.query = (sql, params) => loggedQuery(rawConnQuery, sql, params);

    const rawBegin = connection.beginTransaction.bind(connection);
    connection.beginTransaction = async (...args) => {
        if (SHOW_SQL) console.log('\n[SQL] ---- BEGIN TRANSACTION ----');
        return rawBegin(...args);
    };

    const rawCommit = connection.commit.bind(connection);
    connection.commit = async (...args) => {
        if (SHOW_SQL) console.log('[SQL] ---- COMMIT ----\n');
        return rawCommit(...args);
    };

    const rawRollback = connection.rollback.bind(connection);
    connection.rollback = async (...args) => {
        if (SHOW_SQL) console.log('[SQL] ---- ROLLBACK ----\n');
        return rawRollback(...args);
    };

    return connection;
};

module.exports = pool;
