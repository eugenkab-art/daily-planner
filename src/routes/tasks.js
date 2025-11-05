// src/routes/tasks.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db'); // Подключение к базе данных
const authMiddleware = require('../middleware/authMiddleware'); // Проверка авторизации

// Все маршруты ниже требуют авторизации благодаря authMiddleware

// --- GET /api/tasks?date=YYYY-MM-DD ---
// Получить все задачи для конкретной даты
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const date = req.query.date;

    if (!date) {
        return res.status(400).json({ error: 'Требуется параметр "date" в формате YYYY-MM-DD' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM tasks WHERE user_id = $1 AND date = $2 ORDER BY id ASC',
            [userId, date]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка при получении задач:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});


// --- GET /api/tasks/count?date=YYYY-MM-DD ---
// Получить количество задач для конкретной даты (используется для weekly.html)
router.get('/count', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const date = req.query.date;
    
    if (!date) {
        return res.status(400).json({ error: 'Требуется параметр "date" в формате YYYY-MM-DD' });
    }

    try {
        const result = await pool.query(
            'SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND date = $2',
            [userId, date]
        );
        // Возвращаем объект { count: N }
        res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
        // Ошибка при подсчете задач
        console.error('Ошибка при подсчете задач:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});


// --- POST /api/tasks ---
// Создать новую задачу
router.post('/', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const { text, date } = req.body; 

    if (!text || !date) {
        return res.status(400).json({ error: 'Требуется текст задачи и дата' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO tasks (user_id, text, date, completed) VALUES ($1, $2, $3, FALSE) RETURNING *',
            [userId, text, date]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при создании задачи:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});


// --- PATCH /api/tasks/:id ---
// Обновить статус задачи (выполнена/не выполнена)
router.patch('/:id', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const taskId = req.params.id;
    const { completed } = req.body; 

    if (typeof completed !== 'boolean') {
        return res.status(400).json({ error: 'Требуется булево значение "completed"' });
    }

    try {
        const result = await pool.query(
            'UPDATE tasks SET completed = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [completed, taskId, userId]
        );

        if (result.rows.length === 0) {
            // Возврат 404, если задача не найдена или не принадлежит пользователю
            return res.status(404).json({ error: 'Задача не найдена или не принадлежит пользователю' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка при обновлении задачи:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});


// --- DELETE /api/tasks/:id ---
// Удалить задачу
router.delete('/:id', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const taskId = req.params.id;

    try {
        const result = await pool.query(
            'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
            [taskId, userId]
        );

        if (result.rows.length === 0) {
            // Возврат 404, если задача не найдена или не принадлежит пользователю
            return res.status(404).json({ error: 'Задача не найдена или не принадлежит пользователю' });
        }

        res.status(204).send(); // 204 No Content - успешное удаление
    } catch (err) {
        console.error('Ошибка при удалении задачи:', err.stack || err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;