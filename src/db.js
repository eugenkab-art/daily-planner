// src/db.js

const { Pool } = require('pg');

// Используем DATABASE_URL, который Render автоматически устанавливает для PostgreSQL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("FATAL: Переменная окружения DATABASE_URL не установлена.");
    // В Production это должно вызвать остановку процесса
    // process.exit(1); 
}

const pool = new Pool({
    connectionString: connectionString,
    // Настройки для Render (PostgreSQL on SSL)
    ssl: {
        rejectUnauthorized: false
    }
});

// Проверка соединения при старте
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Ошибка подключения к PostgreSQL (проверьте DATABASE_URL):', err.stack);
    }
    client.release();
    console.log('PostgreSQL: Соединение установлено успешно.');
});

module.exports = {
    pool,
};