// src/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Маршруты аутентификации
router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;