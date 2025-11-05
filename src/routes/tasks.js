// src/routes/tasks.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// --- Маршрут GET /api/tasks/count (для получения количества задач по дате) ---
router.get('/count', authenticateToken, async (req, res) => {
    const { date } = req.query; 

    if (!date) {
        return res.status(400).json({ message: 'Параметр "date" обязателен.' });
    }

    try {
        const result = await pool.query(
            'SELECT COUNT(*) FROM tasks_v2 WHERE user_id = $1 AND date = $2 AND completed = FALSE',
            [req.user.id, date]
        );

        res.json({ count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Ошибка при получении счетчика задач:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});


// --- Маршрут GET /api/tasks (для получения списка задач по дате) ---
router.get('/', authenticateToken, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: 'Параметр "date" обязателен.' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM tasks_v2 WHERE user_id = $1 AND date = $2 ORDER BY id ASC',
            [req.user.id, date]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка при получении списка задач:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// --- Маршрут POST /api/tasks (для создания новой задачи) ---
router.post('/', authenticateToken, async (req, res) => {
    const { text, date } = req.body;
    
    if (!text || !date) {
        return res.status(400).json({ message: 'Текст и дата задачи обязательны.' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO tasks_v2 (user_id, text, date) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, text, date]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Ошибка при создании задачи:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});


// --- Маршрут PATCH /api/tasks/:id (для обновления статуса задачи) ---
router.patch('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;

    if (typeof completed !== 'boolean') {
        return res.status(400).json({ message: 'Параметр "completed" обязателен и должен быть логическим значением.' });
    }

    try {
        const result = await pool.query(
            'UPDATE tasks_v2 SET completed = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [completed, id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Задача не найдена или не принадлежит пользователю.' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Ошибка при обновлении задачи:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// --- Маршрут DELETE /api/tasks/:id (для удаления задачи) ---
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM tasks_v2 WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Задача не найдена или не принадлежит пользователю.' });
        }

        res.status(204).send(); // 204 No Content
    } catch (error) {
        console.error('Ошибка при удалении задачи:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;