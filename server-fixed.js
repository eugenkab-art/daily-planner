require('dotenv').config();

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 3809;

// Подключение к PostgreSQL с IPv4
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false
  },
  family: 4,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

// JWT секрет
const JWT_SECRET = process.env.JWT_SECRET || 'daily-planner-secret-key-2024';

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// Создание таблиц
async function initializeDatabase() {
  try {
    // Таблица пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица заметок
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        done BOOLEAN DEFAULT FALSE,
        date DATE DEFAULT CURRENT_DATE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ База данных инициализирована');
  } catch (error) {
    console.error('❌ Ошибка инициализации базы:', error);
  }
}

// ... остальной код БЕЗ ИЗМЕНЕНИЙ ...