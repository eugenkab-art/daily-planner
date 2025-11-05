// server.js (ФИНАЛЬНАЯ ВЕРСИЯ С ИСПРАВЛЕННЫМИ ПУТЯМИ И CORS)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path'); // Модуль для работы с путями

// --- Инициализация Express ---
const app = express();

// --- Импорт Роутов ---
// Используем 'path' для корректной работы путей независимо от ОС
const authRoutes = require(path.join(__dirname, 'src', 'routes', 'auth'));
const taskRoutes = require(path.join(__dirname, 'src', 'routes', 'tasks'));
const noteRoutes = require(path.join(__dirname, 'src', 'routes', 'notes'));


// --- Middleware (Промежуточное ПО) ---

// 1. CORS: разрешаем запросы с любого домена (для Render и Live Server)
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ОБРАБОТКА OPTIONS (Preflight) - КРИТИЧНО!
app.options('*', cors());

// 2. Body Parser: для обработки JSON-запросов
app.use(bodyParser.json());


// --- Маршруты API ---

// Маршруты авторизации
app.use('/api/auth', authRoutes);

// Маршруты задач (также включает маршрут /count)
app.use('/api/tasks', taskRoutes);

// Маршруты заметок
app.use('/api/notes', noteRoutes);


// --- Запуск Сервера ---
// На Render используется process.env.PORT, локально - 3000
const PORT = process.env.PORT || 3000; 

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});