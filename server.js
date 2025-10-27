require('dotenv').config();

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const app = express();

const port = process.env.PORT || 3809;

// Подключение к SQLite
const db = new sqlite3.Database(path.join(__dirname, 'notes.db'), (err) => {
  if (err) {
    console.error('❌ Ошибка подключения к SQLite:', err);
  } else {
    console.log('✅ SQLite база данных подключена');
    initializeDatabase();
  }
});

// JWT секрет
const JWT_SECRET = process.env.JWT_SECRET || 'daily-planner-secret-key-2024';

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// Создание таблиц
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    // Таблица пользователей
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('❌ Ошибка создания таблицы users:', err);
        reject(err);
      } else {
        console.log('✅ Таблица users готова');
        
        // Таблица заметок
        db.run(`
          CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            done BOOLEAN DEFAULT FALSE,
            date DATE DEFAULT CURRENT_DATE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            console.error('❌ Ошибка создания таблицы notes:', err);
            reject(err);
          } else {
            console.log('✅ Таблица notes готова');
            console.log('🎯 База данных инициализирована');
            resolve();
          }
        });
      }
    });
  });
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
    
    db.run(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
          }
          console.error('❌ Ошибка регистрации:', err);
          return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
        }

        const userId = this.lastID;
        const token = jwt.sign({ id: userId, username: username }, JWT_SECRET);
        
        res.json({ 
          message: 'Пользователь успешно зарегистрирован', 
          token,
          user: { id: userId, username: username }
        });
      }
    );
  } catch (error) {
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
    db.get(
      "SELECT * FROM users WHERE username = ?",
      [username],
      async (err, user) => {
        if (err) {
          console.error('❌ Ошибка входа:', err);
          return res.status(500).json({ error: 'Ошибка сервера' });
        }

        if (!user) {
          return res.status(400).json({ error: 'Пользователь не найден' });
        }

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
      }
    );
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение заметок
app.get('/api/notes', authenticateToken, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const userId = req.user.id;

  db.all(
    "SELECT * FROM notes WHERE date = ? AND user_id = ? ORDER BY id",
    [date, userId],
    (err, rows) => {
      if (err) {
        console.error('❌ Ошибка получения заметок:', err);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
      res.json(rows);
    }
  );
});

// Добавление заметки
app.post('/api/notes', authenticateToken, (req, res) => {
  const note = req.body.text;
  const date = req.body.date || new Date().toISOString().split('T')[0];
  const userId = req.user.id;
  
  if (!note || note.trim() === '') {
    return res.status(400).json({ error: 'Текст заметки не может быть пустым' });
  }

  db.run(
    "INSERT INTO notes (text, date, user_id) VALUES (?, ?, ?)",
    [note.trim(), date, userId],
    function(err) {
      if (err) {
        console.error('❌ Ошибка добавления заметки:', err);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
      
      // Возвращаем созданную заметку
      db.get(
        "SELECT * FROM notes WHERE id = ?",
        [this.lastID],
        (err, row) => {
          if (err) {
            console.error('❌ Ошибка получения созданной заметки:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
          }
          res.json(row);
        }
      );
    }
  );
});

// Переключение статуса
app.put('/api/notes/:id/toggle', authenticateToken, (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;

  db.run(
    "UPDATE notes SET done = NOT done WHERE id = ? AND user_id = ?",
    [id, userId],
    function(err) {
      if (err) {
        console.error('❌ Ошибка переключения статуса:', err);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Заметка не найдена' });
      }
      
      res.json({ success: true });
    }
  );
});

// Удаление заметки
app.delete('/api/notes/:id', authenticateToken, (req, res) => {
  const id = req.params.id;
  const userId = req.user.id;

  db.run(
    "DELETE FROM notes WHERE id = ? AND user_id = ?",
    [id, userId],
    function(err) {
      if (err) {
        console.error('❌ Ошибка удаления заметки:', err);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Заметка не найдена' });
      }
      
      res.json({ message: 'Заметка успешно удалена' });
    }
  );
});

// Тестовый эндпоинт для проверки БД
app.get('/api/db-status', (req, res) => {
  db.get("SELECT datetime('now') as current_time, COUNT(*) as users_count FROM users", (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      status: '✅ SQLite работает',
      current_time: row.current_time,
      users_count: row.users_count
    });
  });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`🎯 Ежедневник запущен: http://localhost:${port}`);
  console.log(`📅 Порт: ${port}`);
  console.log(`💾 База данных: SQLite`);
  console.log(`🔐 Режим: ${process.env.NODE_ENV || 'development'}`);
});

// Обработка 404
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🔄 Завершение работы...');
  db.close((err) => {
    if (err) {
      console.error('❌ Ошибка закрытия БД:', err);
      process.exit(1);
    }
    console.log('✅ База данных закрыта');
    process.exit(0);
  });
});