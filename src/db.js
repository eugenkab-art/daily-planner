// src/db.js

const { Pool } = require('pg');
const path = require('path');

// КРИТИЧЕСКИ ВАЖНО: Используем DATABASE_URL из окружения Render
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: DATABASE_URL не установлен!");
    throw new Error("DATABASE_URL не установлен. Проверьте переменные окружения на Render.");
}

// Конфигурация для Render (обработка SSL)
const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Обязательно для подключения к Render DB
    }
});

// --- Функция для создания таблиц ---
async function createTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                text TEXT NOT NULL,
                date DATE NOT NULL,
                completed BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS notes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                text TEXT NOT NULL,
                date DATE NOT NULL, -- ИСПРАВЛЕНИЕ: Убрано дублирующееся слово DATE
                done BOOLEAN DEFAULT FALSE
            );
        `);
        console.log("Таблицы успешно проверены/созданы.");
    } catch (err) {
        console.error("Ошибка при создании таблиц:", err.stack);
        // Не бросаем ошибку, чтобы не остановить сервер, если таблица уже существует
    }
}

// Экспорт: pool для запросов и createTables для инициализации
module.exports = {
    pool,
    createTables 
};