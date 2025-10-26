require('dotenv').config();

const express = require("express");
const { Pool } = require("pg");
const { Socket } = require('net');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 3809;

// 🔧 КРИТИЧЕСКИЙ ПАТЧ - принудительно отключаем IPv6
console.log('🔧 Применяем патч для IPv4...');
const OriginalSocket = Socket;
Socket.prototype.connect = function(...args) {
    const options = args[0];
    if (options && typeof options === 'object' && options.family === 6) {
        console.log('🔄 Принудительно меняем IPv6 на IPv4');
        options.family = 4;
    }
    return OriginalSocket.prototype.connect.apply(this, args);
};

// Подключение к PostgreSQL
const pool = new Pool({
    host: 'db.bmqtmlpayroihrxmwzfj.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'MyDailyPlanner123',
    ssl: { 
        rejectUnauthorized: false 
    },
    family: 4, // Явно указываем IPv4
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 60000
});

console.log('🔧 Настройки подключения:', {
    host: 'db.bmqtmlpayroihrxmwzfj.supabase.co',
    family: 4
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

// Middleware для проверки авторизации
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Неверный токен' });
        }
        req.user = user;
        next();
    });
};

// Регистрация
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
            [username, hashedPassword]
        );

        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
        
        res.json({ 
            message: 'Пользователь успешно зарегистрирован', 
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
        }
        console.error('❌ Ошибка регистрации:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Авторизация
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
    }

    try {
        const result = await pool.query(
            "SELECT * FROM users WHERE username = $1",
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
        
        res.json({ 
            message: 'Успешный вход в систему', 
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('❌ Ошибка входа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение заметок
app.get('/api/notes', authenticateToken, async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const userId = req.user.id;

    try {
        const result = await pool.query(
            "SELECT * FROM notes WHERE date = $1 AND user_id = $2 ORDER BY id",
            [date, userId]
        );
        
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Ошибка получения заметок:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавление заметки
app.post('/api/notes', authenticateToken, async (req, res) => {
    const note = req.body.text;
    const date = req.body.date || new Date().toISOString().split('T')[0];
    const userId = req.user.id;
    
    if (!note || note.trim() === '') {
        return res.status(400).json({ error: 'Текст заметки не может быть пустым' });
    }

    try {
        const result = await pool.query(
            "INSERT INTO notes (text, date, user_id) VALUES ($1, $2, $3) RETURNING *",
            [note.trim(), date, userId]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('❌ Ошибка добавления заметки:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Переключение статуса
app.put('/api/notes/:id/toggle', authenticateToken, async (req, res) => {
    const id = req.params.id;
    const userId = req.user.id;

    try {
        const result = await pool.query(
            "UPDATE notes SET done = NOT done WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Заметка не найдена' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Ошибка переключения статуса:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удаление заметки
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
    const id = req.params.id;
    const userId = req.user.id;

    try {
        const result = await pool.query(
            "DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Заметка не найдена' });
        }
        
        res.json({ message: 'Заметка успешно удалена' });
    } catch (error) {
        console.error('❌ Ошибка удаления заметки:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Инициализация и запуск
initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`🎯 Ежедневник запущен: http://localhost:${port}`);
        console.log(`📅 Порт: ${port}`);
        console.log(`🔐 Режим: ${process.env.NODE_ENV || 'development'}`);
    });
});

// Обработка 404
app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
});