require('dotenv').config();

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 3809;
const HOST = '0.0.0.0'; // Для совместимости с Render/Cyclic

// Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false
  },
  // family: 4, // Убираем, так как это вызывало проблемы
});

// JWT секрет
const JWT_SECRET = process.env.JWT_SECRET || 'daily-planner-secret-key-2024';

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// ------------------------------------------------------------------
// БЛОК 1: Инициализация БД
// ------------------------------------------------------------------

async function initializeDatabase() {
  try {
    // Таблица пользователей - ИСПРАВЛЕНО: email, password_hash
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица задач
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

    // Таблица заметок
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
    // В случае ошибки не продолжаем работу
    process.exit(1);
  }
}

// ------------------------------------------------------------------
// БЛОК 2: Middleware Аутентификации
// ------------------------------------------------------------------

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Формат: 'Bearer TOKEN'
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'Авторизация не предоставлена.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // 403 Forbidden - Токен невалидный или истёк
      return res.status(403).json({ error: 'Недействительный или просроченный токен.' });
    }
    // Если токен валиден, добавляем данные пользователя в req
    req.user = user;
    next();
  });
}

// ------------------------------------------------------------------
// БЛОК 3: Роуты Аутентификации
// ------------------------------------------------------------------

// POST /api/auth/register (ИСПРАВЛЕНО: email и password_hash)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, пароль и имя обязательны.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // ИСПРАВЛЕННЫЙ SQL: email, password_hash
    const query = `
      INSERT INTO users (email, password_hash, name)
      VALUES ($1, $2, $3)
      RETURNING id, email, name;
    `;
    const values = [email, hashedPassword, name];
    
    const result = await pool.query(query, values);
    const user = result.rows[0];

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({ token, user });

  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    // 23505 - код ошибки PostgreSQL для уникального ключа (email уже существует)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует.' });
    }
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// POST /api/auth/login (ИСПРАВЛЕНО: email и password_hash)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // ИСПРАВЛЕННЫЙ SQL: Выбираем по email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль.' });
    }

    // Сравниваем хэш из БД (password_hash) с предоставленным паролем
    const isMatch = await bcrypt.compare(password, user.password_hash); 

    if (!isMatch) {
      return res.status(401).json({ error: 'Неверный email или пароль.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    
    // Удаляем хэш пароля из объекта для ответа
    delete user.password_hash;
    
    res.json({ token, user });

  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера при входе.' });
  }
});


// ------------------------------------------------------------------
// БЛОК 4: Роуты CRUD Задач (Tasks)
// ------------------------------------------------------------------

// GET /api/tasks?date=YYYY-MM-DD
app.get('/api/tasks', authenticateToken, async (req, res) => {
  const { date } = req.query;
  const userId = req.user.id;

  if (!date) {
    return res.status(400).json({ error: 'Параметр date обязателен.' });
  }

  try {
    const query = `
      SELECT id, text, completed, date, created_at
      FROM tasks
      WHERE user_id = $1 AND date = $2
      ORDER BY created_at ASC;
    `;
    const result = await pool.query(query, [userId, date]);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Ошибка получения задач:', error);
    res.status(500).json({ error: 'Ошибка сервера при получении задач.' });
  }
});

// POST /api/tasks
app.post('/api/tasks', authenticateToken, async (req, res) => {
  const { text, date } = req.body;
  const userId = req.user.id; 

  if (!text || !date) {
    return res.status(400).json({ error: 'Текст и дата задачи обязательны.' });
  }

  try {
    const query = `
      INSERT INTO tasks (text, date, user_id)
      VALUES ($1, $2, $3)
      RETURNING id, text, completed, date, user_id, created_at;
    `;
    const values = [text, date, userId];
    
    const result = await pool.query(query, values);
    
    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('❌ Ошибка создания задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера при создании задачи.' });
  }
});

// PATCH /api/tasks/:id
app.patch('/api/tasks/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  const userId = req.user.id;
  
  // Проверяем, что поле 'completed' существует и является булевым
  if (typeof completed !== 'boolean') {
    return res.status(400).json({ error: 'Поле "completed" должно быть логическим (true/false).' });
  }

  try {
    const query = `
      UPDATE tasks
      SET completed = $1
      WHERE id = $2 AND user_id = $3
      RETURNING id, completed;
    `;
    const result = await pool.query(query, [completed, id, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Задача не найдена или не принадлежит пользователю.' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('❌ Ошибка обновления задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера при обновлении задачи.' });
  }
});

// DELETE /api/tasks/:id
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const query = `
      DELETE FROM tasks
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `;
    const result = await pool.query(query, [id, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Задача не найдена или не принадлежит пользователю.' });
    }

    res.json({ message: 'Задача успешно удалена.' });

  } catch (error) {
    console.error('❌ Ошибка удаления задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера при удалении задачи.' });
  }
});


// ------------------------------------------------------------------
// БЛОК 5: Роуты CRUD Заметок (Notes)
// ------------------------------------------------------------------
// (По аналогии с задачами, используется таблица 'notes')

// GET /api/notes?date=YYYY-MM-DD
app.get('/api/notes', authenticateToken, async (req, res) => {
    const { date } = req.query;
    const userId = req.user.id;

    if (!date) {
        return res.status(400).json({ error: 'Параметр date обязателен.' });
    }

    try {
        const query = `
            SELECT id, text, done, date
            FROM notes
            WHERE user_id = $1 AND date = $2
            ORDER BY id ASC;
        `;
        const result = await pool.query(query, [userId, date]);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Ошибка получения заметок:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении заметок.' });
    }
});

// POST /api/notes
app.post('/api/notes', authenticateToken, async (req, res) => {
    const { text, date } = req.body;
    const userId = req.user.id; 

    if (!text || !date) {
        return res.status(400).json({ error: 'Текст и дата заметки обязательны.' });
    }

    try {
        const query = `
            INSERT INTO notes (text, date, user_id)
            VALUES ($1, $2, $3)
            RETURNING id, text, done, date, user_id;
        `;
        const values = [text, date, userId];
        
        const result = await pool.query(query, values);
        
        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('❌ Ошибка создания заметки:', error);
        res.status(500).json({ error: 'Ошибка сервера при создании заметки.' });
    }
});

// PATCH /api/notes/:id
app.patch('/api/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { done } = req.body;
    const userId = req.user.id;

    if (typeof done !== 'boolean') {
        return res.status(400).json({ error: 'Поле "done" должно быть логическим (true/false).' });
    }

    try {
        const query = `
            UPDATE notes
            SET done = $1
            WHERE id = $2 AND user_id = $3
            RETURNING id, done;
        `;
        const result = await pool.query(query, [done, id, userId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Заметка не найдена или не принадлежит пользователю.' });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('❌ Ошибка обновления заметки:', error);
        res.status(500).json({ error: 'Ошибка сервера при обновлении заметки.' });
    }
});

// DELETE /api/notes/:id
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const query = `
            DELETE FROM notes
            WHERE id = $1 AND user_id = $2
            RETURNING id;
        `;
        const result = await pool.query(query, [id, userId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Заметка не найдена или не принадлежит пользователю.' });
        }

        res.json({ message: 'Заметка успешно удалена.' });

    } catch (error) {
        console.error('❌ Ошибка удаления заметки:', error);
        res.status(500).json({ error: 'Ошибка сервера при удалении заметки.' });
    }
});


// ------------------------------------------------------------------
// БЛОК 6: Проверка Статуса БД (Health Check)
// ------------------------------------------------------------------

// GET /api/health - Проверка статуса сервера и БД
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1'); // Простой запрос для проверки соединения
    res.json({
      status: 'OK',
      db: 'PostgreSQL Connected',
      host: 'Cyclic/Render'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    res.status(500).json({
      status: 'Error',
      db: `PostgreSQL Failed: ${error.message}`,
      host: 'Cyclic/Render'
    });
  }
});

// ------------------------------------------------------------------
// БЛОК 7: Инициализация БД и Запуск Сервера
// ------------------------------------------------------------------

// Вызов инициализации и запуск сервера
initializeDatabase().then(() => {
    // Используем HOST (0.0.0.0) для корректной привязки на хостинге
    app.listen(port, HOST, () => { 
      console.log(`🎯 Ежедневник запущен: http://${HOST}:${port}`);
      console.log(`📅 Порт: ${port}`);
      console.log(`💾 База данных: PostgreSQL`);
      console.log(`🔐 Режим: ${process.env.NODE_ENV || 'development'}`);
    });
});