#!/bin/sh

EXT_DIR="/home/definitly/widevine-l3-decrypter"

echo "1. Запуск Firefox..."
# Запускаем Firefox в фоне
/usr/local/bin/firefox &

# Ждем 5 секунд, пока браузер откроется
sleep 5

echo "2. Поиск окна Firefox и активация..."
# Находим ID окна Firefox и делаем его активным
WIN_ID=$(xdotool search --class "firefox" | head -1)
if [ -z "$WIN_ID" ]; then
    echo "Ошибка: окно Firefox не найдено!"
    exit 1
fi
xdotool windowactivate $WIN_ID
sleep 2

echo "3. Переход на страницу отладки..."
# Фокус на адресную строку
xdotool key ctrl+l
sleep 1
# Вводим адрес и нажимаем Enter
xdotool type "about:debugging#/runtime/this-firefox"
xdotool key Return

# Ждем 4 секунды, пока страница загрузится и отрисует элементы
sleep 4

echo "4. Навигация к кнопке 'Загрузить временное дополнение...'..."
# На этой странице фокус по умолчанию может быть вверху. 
# Обычно нужно нажать Tab 3 или 4 раза, чтобы попасть на нужную кнопку, затем Enter.
# (Количество Tab может отличаться в зависимости от версии Firefox, подберите опытным путем)
xdotool key Tab Tab  Tab Tab Tab  Return

sleep 2

echo "5. Выбор файла manifest.json в диалоге..."
# В диалоге выбора файла фокус часто сразу на строке пути, или его можно вызвать через Ctrl+L
xdotool key ctrl+l
sleep 1
xdotool type "$EXT_DIR/manifest.json"
sleep 1
xdotool key Return

echo "Готово! Расширение должно быть загружено."