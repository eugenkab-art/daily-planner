require('dotenv').config();

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 3809;

// JWT Секрет: Используем переменную окружения
const JWT_SECRET = process.env.JWT_SECRET || 'daily-planner-secret-key-2024';

// ------------------------------------------------------------------
// БЛОК 1: ИСПРАВЛЕННОЕ Подключение к PostgreSQL (Убраны проблемные патчи IPv4)
// ------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false // Требуется для внешнего хостинга, такого как Cyclic
  }
  // Критические настройки family: 4, connectionTimeoutMillis УДАЛЕНЫ
});

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// ------------------------------------------------------------------
// БЛОК 2: Health Check (Проверка статуса DB)
// ------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1'); // Простейший запрос для проверки связи
        res.status(200).json({ status: 'OK', db: 'PostgreSQL Connected', host: 'Cyclic/Render' });
    } catch (error) {
        console.error('❌ DB Health Check Failed:', error);
        res.status(503).json({ status: 'Error', db: 'Disconnected', details: error.message });
    }
});


// ------------------------------------------------------------------
// БЛОК 3: Middleware для Токена (защита роутов)
// ------------------------------------------------------------------
const authenticateToken = (req, res, next) => {
    // Ожидаем заголовок: Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (token == null) {
        return res.status(401).json({ message: 'Access denied. Token missing.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token.' }); 
        }
        // Сохраняем ID пользователя для использования в роутах
        req.user = user; 
        next(); 
    });
};


// ------------------------------------------------------------------
// БЛОК 4: Роуты Аутентификации (Регистрация и Вход)
// ------------------------------------------------------------------

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;
    
    try {
        // 1. Хеширование
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. Вставка пользователя (используем email)
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
            [email, hashedPassword, name]
        );

        const user = result.rows[0];
        // 3. Генерация токена
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });

    } catch (error) {
        if (error.code === '23505') { // PostgreSQL: unique violation
            return res.status(409).json({ message: 'User with this email already exists.' });
        }
        console.error('❌ Registration error:', error.message);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // 1. Поиск пользователя
        const result = await pool.query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // 2. Сравнение паролей
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // 3. Создание токена
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });

    } catch (error) {
        console.error('❌ Login error:', error.message);
        res.status(500).json({ message: 'Server error during login.' });
    }
});


// ------------------------------------------------------------------
// БЛОК 5: CRUD для Задач (Tasks) - Защищенный
// ------------------------------------------------------------------

// GET /api/tasks?date=YYYY-MM-DD (Получение задач)
app.get('/api/tasks', authenticateToken, async (req, res) => {
    const { date } = req.query; 
    const userId = req.user.id;
    
    try {
        const result = await pool.query(
            'SELECT id, text, completed FROM tasks WHERE user_id = $1 AND date = $2 ORDER BY id',
            [userId, date]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error fetching tasks:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/tasks (Создание задачи)
app.post('/api/tasks', authenticateToken, async (req, res) => {
    const { text, date } = req.body;
    const userId = req.user.id;
    
    try {
        const result = await pool.query(
            'INSERT INTO tasks (user_id, text, date) VALUES ($1, $2, $3) RETURNING id, text, completed, date',
            [userId, text, date]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('❌ Error creating task:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PATCH /api/tasks/:id (Обновление задачи: статус завершения)
app.patch('/api/tasks/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body; 
    const userId = req.user.id;

    try {
        const result = await pool.query(
            'UPDATE tasks SET completed = $1 WHERE id = $2 AND user_id = $3 RETURNING id, text, completed',
            [completed, id, userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Task not found or not owned by user.' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('❌ Error updating task:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/tasks/:id (Удаление задачи)
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const result = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Task not found or not owned by user.' });
        }
        res.status(204).send(); // 204 No Content
    } catch (error) {
        console.error('❌ Error deleting task:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// ------------------------------------------------------------------
// БЛОК 6: CRUD для Заметок (Notes) - Защищенный
// ------------------------------------------------------------------

// GET /api/notes?date=YYYY-MM-DD (Получение заметок)
app.get('/api/notes', authenticateToken, async (req, res) => {
    const { date } = req.query; 
    const userId = req.user.id;
    
    try {
        const result = await pool.query(
            'SELECT id, text, done, date FROM notes WHERE user_id = $1 AND date = $2 ORDER BY id',
            [userId, date]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error fetching notes:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/notes (Создание заметки)
app.post('/api/notes', authenticateToken, async (req, res) => {
    const { text, date } = req.body;
    const userId = req.user.id;
    
    try {
        const result = await pool.query(
            'INSERT INTO notes (user_id, text, date) VALUES ($1, $2, $3) RETURNING id, text, done, date',
            [userId, text, date]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('❌ Error creating note:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/notes/:id (Удаление заметки)
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const result = await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, userId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Note not found or not owned by user.' });
        }
        res.status(204).send(); // 204 No Content
    } catch (error) {
        console.error('❌ Error deleting note:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// ------------------------------------------------------------------
// БЛОК 7: Инициализация БД и Запуск Сервера
// ------------------------------------------------------------------

// Создание таблиц (исправленная схема)
async function initializeDatabase() {
  try {
    // Таблица пользователей: ИСПРАВЛЕНА: email вместо username, password_hash
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,  
        password_hash TEXT NOT NULL,         
        name VARCHAR(100),                   
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица ЗАДАЧ (tasks)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        date DATE DEFAULT CURRENT_DATE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица заметок (notes)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        done BOOLEAN DEFAULT FALSE,
        date DATE DEFAULT CURRENT_DATE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ Все таблицы БД успешно инициализированы/проверены.');

  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА Инициализации базы данных:', error);
  }
}

// Вызов инициализации и запуск сервера
initializeDatabase().then(() => {
    app.listen(port, () => {
      console.log(`🎯 Ежедневник запущен: http://localhost:${port}`);
      console.log(`📅 Порт: ${port}`);
      console.log(`💾 База данных: PostgreSQL`);
      console.log(`🔐 Режим: ${process.env.NODE_ENV || 'development'}`);
    });
});