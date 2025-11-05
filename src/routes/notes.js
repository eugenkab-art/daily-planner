// src/routes/notes.js

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/authMiddleware');

// --- Маршрут GET /api/notes (получение списка заметок по дате) ---
router.get('/', authenticateToken, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: 'Параметр "date" обязателен.' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM notes_v2 WHERE user_id = $1 AND date = $2 ORDER BY id ASC',
            [req.user.id, date]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка при получении списка заметок:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// --- Маршрут POST /api/notes (создание новой заметки) ---
router.post('/', authenticateToken, async (req, res) => {
    const { text, date } = req.body;
    
    if (!text || !date) {
        return res.status(400).json({ message: 'Текст и дата заметки обязательны.' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO notes_v2 (user_id, text, date) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, text, date]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Ошибка при создании заметки:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});


// --- Маршрут PATCH /api/notes/:id (обновление заметки) ---
router.patch('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { text, done } = req.body;

    // Параметры text и done могут быть необязательными, но хотя бы один должен быть
    if (text === undefined && done === undefined) {
        return res.status(400).json({ message: 'Необходимо предоставить хотя бы "text" или "done".' });
    }

    try {
        let queryText = 'UPDATE notes_v2 SET ';
        const queryParams = [];
        let paramIndex = 1;

        if (text !== undefined) {
            queryText += `text = $${paramIndex++}`;
            queryParams.push(text);
        }

        if (done !== undefined) {
            if (queryParams.length > 0) queryText += ', ';
            queryText += `done = $${paramIndex++}`;
            queryParams.push(done);
        }

        queryText += ` WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} RETURNING *`;
        queryParams.push(id, req.user.id);
        
        const result = await pool.query(queryText, queryParams);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Заметка не найдена или не принадлежит пользователю.' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Ошибка при обновлении заметки:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

// --- Маршрут DELETE /api/notes/:id (удаление заметки) ---
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM notes_v2 WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Заметка не найдена или не принадлежит пользователю.' });
        }

        res.status(204).send(); // 204 No Content
    } catch (error) {
        console.error('Ошибка при удалении заметки:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;