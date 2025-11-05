// server.js (ФИНАЛЬНАЯ ВЕРСИЯ С ИСПРАВЛЕНИЕМ PathError и упрощенными путями)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// --- Инициализация Express ---
const app = express();

// --- Импорт Роутов ---
// Используем стандартный require, так как server.js находится в корне,
// и все роуты лежат в ./src/routes/
const authRoutes = require('./src/routes/auth');
const taskRoutes = require('./src/routes/tasks'); 
const noteRoutes = require('./src/routes/notes');


// --- Middleware (Промежуточное ПО) ---

// 1. CORS: разрешаем запросы с любого домена (для Render и Live Server)
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? [process.env.RENDER_FRONTEND_URL, 'https://daily-planner-frontend.onrender.com'] // Замените на реальные URL фронтенда
    : ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000', '*']; 

app.use(cors({
    origin: '*', // Используем '*' для максимальной совместимости сейчас.
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ОБРАБОТКА OPTIONS (Preflight) - ИСПРАВЛЕНИЕ PathError
// Мы удаляем строку app.options('*', cors()), так как app.use(cors()) 
// должен обрабатывать предзапросы автоматически. 
// Если проблема останется, используем явный синтаксис: app.options('/api/*', cors());


// 2. Body Parser: для обработки JSON-запросов
app.use(bodyParser.json());


// --- Маршруты API ---

// Маршруты авторизации
app.use('/api/auth', authRoutes);

// Маршруты задач 
app.use('/api/tasks', taskRoutes);

// Маршруты заметок
app.use('/api/notes', noteRoutes);


// --- Запуск Сервера ---
// На Render используется process.env.PORT, локально - 3000
const PORT = process.env.PORT || 3000; 

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});