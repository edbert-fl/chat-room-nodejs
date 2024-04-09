const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL ,
})

module.exports.pool = pool;

module.exports.initializeDatabase = async () => {
  const client = await pool.connect();
  client.release();
};
