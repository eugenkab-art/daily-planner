// src/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');

// КРИТИЧЕСКИ: Требуем JWT_SECRET из переменных окружения
const JWT_SECRET = process.env.JWT_SECRET; 

if (!JWT_SECRET) {
    console.error("FATAL: JWT_SECRET не установлен. Сервер не может работать безопасно.");
    // process.exit(1);
}

const authMiddleware = (req, res, next) => {
    // 1. Получение токена из заголовка Authorization
    const authHeader = req.header('Authorization');
    
    // Проверка наличия заголовка
    if (!authHeader) {
        return res.status(401).json({ error: 'Не авторизован: отсутствует заголовок авторизации' });
    }

    // Токен должен быть в формате "Bearer <токен>"
    const token = authHeader.replace('Bearer ', '');
    
    // 2. Проверка токена
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Добавляем ID пользователя в объект запроса для использования в роутах
        req.userId = decoded.id;
        next(); // Все в порядке, продолжаем выполнение маршрута

    } catch (err) {
        // Ошибка (срок истек, подпись неверна, токен отсутствует)
        console.error('Ошибка JWT:', err.message);
        return res.status(401).json({ error: 'Недействительный или истекший токен' });
    }
};

module.exports = authMiddleware;