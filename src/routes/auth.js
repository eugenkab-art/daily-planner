// src/routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool, createTables } = require('../db'); // Импорт pool и createTables
const path = require('path');

// КРИТИЧЕСКИ ВАЖНО: Получаем JWT_SECRET из переменных окружения
const JWT_SECRET = process.env.JWT_SECRET; 
if (!JWT_SECRET) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET не установлен!");
    // В реальном приложении здесь можно остановить процесс или бросить ошибку.
}

// Вызываем создание таблиц один раз при первом обращении к роуту
// (хотя лучше это делать в server.js, это работает как запасной вариант)
createTables().catch(err => {
    console.error('Ошибка при создании таблиц базы данных при старте:', err.stack);
});


// --- POST /api/auth/register ---
router.post('/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Требуется email и пароль' });
    }

    try {
        // 1. Проверка существования пользователя
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
        }

        // 2. Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Создание пользователя
        const newUserResult = await pool.query(
            'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
            [email, hashedPassword]
        );
        const userId = newUserResult.rows[0].id;

        // 4. Создание токена
        const token = jwt.sign({ userId: userId }, JWT_SECRET, { expiresIn: '7d' });

        // 5. Ответ
        res.status(201).json({ 
            message: 'Регистрация успешна', 
            token: token 
        });

    } catch (err) {
        console.error('Ошибка регистрации:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});


// --- POST /api/auth/login ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Требуется email и пароль' });
    }

    try {
        // 1. Поиск пользователя
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        if (!user) {
            // Используем общий ответ для безопасности
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // 2. Сравнение паролей
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // 3. Создание токена
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

        // 4. Ответ
        res.json({ 
            message: 'Вход успешен', 
            token: token 
        });

    } catch (err) {
        console.error('Ошибка входа:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});


module.exports = router;