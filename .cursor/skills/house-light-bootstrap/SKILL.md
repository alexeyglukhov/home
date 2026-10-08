---
name: house-light-bootstrap
description: >-
  Предлагает поставить на рабочий стол ярлыки запуска и остановки 3D-вьювера
  и устанавливает их. Use when bootstrapping house-light, setting up the viewer,
  ярлык, рабочий стол, Дом-start, Дом-stop, or installing the desktop shortcut.
---

# Ярлыки вьювера

На рабочем столе Cinnamon пара ярлыков: **Дом-start** открывает вьювер, **Дом-stop** останавливает сервер `127.0.0.1:8766`. Одинаковое имя и суффиксы `-start` / `-stop`, чтобы значки стояли рядом.

## Предложение

Если нет обоих файлов `$HOME/Desktop/Дом-start.desktop` и `Дом-stop.desktop`, предложи поставить их и дождись согласия. Текст предложения:

Поставить на рабочий стол ярлыки Дом-start и Дом-stop? Первый открывает 3D-вьювер, второй останавливает его.

Не ставь ярлыки, пока пользователь не согласился. Если оба файла уже есть, ничего не предлагай.

## Установка

Из корня репозитория home5:

```bash
.cursor/skills/house-light-bootstrap/scripts/install-desktop.sh
```

Скрипт рисует иконку домика и перечёркнутого домика, пишет оба `.desktop` на рабочий стол (`xdg-user-dir DESKTOP`), помечает их доверенными для Cinnamon и удаляет старый ярлык `Дом.desktop`.

- **Дом-start** вызывает `house-light-viewer/scripts/open-viewer.sh`: один сервер, браузер открывается или поднимается уже открытое окно.
- **Дом-stop** вызывает `house-light-viewer/scripts/stop-viewer.sh`: завершает только `python3 -m http.server 8766 --bind 127.0.0.1`. Окно браузера не закрывает.
