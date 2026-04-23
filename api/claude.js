// Серверная функция — прокси к Anthropic API
// Работает на Vercel, Netlify и других современных хостингах
//
// Зачем нужна: в браузере нельзя напрямую звать api.anthropic.com,
// потому что API-ключ был бы виден всем пользователям.
// Этот файл запускается на сервере, хранит ключ в секрете,
// и передаёт запросы от фронтенда в Anthropic.

export default async function handler(req) {
  // Разрешаем только POST-запросы
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Тело запроса, которое отправил фронтенд
    const body = await req.json();

    // Вызываем Anthropic API, подставляя секретный ключ из переменных окружения
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Настройка для Vercel Edge Runtime (быстрее и дешевле)
export const config = {
  runtime: 'edge'
};
