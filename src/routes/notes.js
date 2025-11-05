// src/routes/notes.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Подключение к базе данных
const authMiddleware = require('../middleware/authMiddleware'); // Проверка авторизации

// --- GET /api/notes?date=YYYY-MM-DD ---
// Получить все заметки для конкретной даты
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const date = req.query.date;

    if (!date) {
        return res.status(400).json({ error: 'Требуется параметр "date" в формате YYYY-MM-DD' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM notes WHERE user_id = $1 AND date = $2 ORDER BY id ASC',
            [userId, date]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении заметок:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// --- POST /api/notes ---
// Создать новую заметку
router.post('/', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const { text, date } = req.body; 

    if (!text || !date) {
        return res.status(400).json({ error: 'Требуется текст заметки и дата' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO notes (user_id, text, date, done) VALUES ($1, $2, $3, FALSE) RETURNING *',
            [userId, text, date]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при создании заметки:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});


// --- PATCH /api/notes/:id ---
// Обновить статус заметки (выполнена/не выполнена)
router.patch('/:id', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const noteId = req.params.id;
    const { done } = req.body; 

    if (typeof done !== 'boolean') {
        return res.status(400).json({ error: 'Требуется булево значение "done"' });
    }

    try {
        const result = await pool.query(
            'UPDATE notes SET done = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [done, noteId, userId]
        );

        if (result.rows.length === 0) {
            // Возврат 404, если заметка не найдена или не принадлежит пользователю
            return res.status(404).json({ error: 'Заметка не найдена или не принадлежит пользователю' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при обновлении заметки:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});


// --- DELETE /api/notes/:id ---
// Удалить заметку
router.delete('/:id', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const noteId = req.params.id;

    try {
        const result = await pool.query(
            'DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id',
            [noteId, userId]
        );

        if (result.rows.length === 0) {
            // Возврат 404, если заметка не найдена или не принадлежит пользователю
            return res.status(404).json({ error: 'Заметка не найдена или не принадлежит пользователю' });
        }

        res.status(204).send();
    } catch (err) {
        console.error('Ошибка при удалении заметки:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;