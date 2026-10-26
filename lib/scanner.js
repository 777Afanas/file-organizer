import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";

export class Scanner extends EventEmitter {
  /**
   * Рекурсивно сканує директорію та збирає детальну статистику про файли
   * (кількість, розміри, типи, вік, топ-3 найбільших та найстаріший файл).
   * @param {string} directory - Шлях до цільової директорії для сканування
   * @returns {Promise<void>}
   */

  async scan(directory) {
    // 2. Ініціалізуємо об'єкти для збору статистики
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      byType: new Map(),
      age: { last7: 0, last30: 0, older90: 0 },
      largestFiles: [],
      oldestFile: { path: "", mtimeMs: Infinity, ageDays: 0 },
    };

    const now = Date.now();
    const MS_IN_DAY = 1000 * 60 * 60 * 24;

    try {
      // 3. Отримуємо всі елементи рекурсивно (потребує Node.js v20+)
      const items = await fs.readdir(directory, {
        recursive: true,
        withFileTypes: true,
      });
      const totalExpected = items.filter((item) => item.isFile()).length; // Рахуємо файли заздалегідь
      this.emit("scan-start", { directory, totalExpected });

      for (const item of items) {
        // 4. Пропускаємо директорії, аналізуємо лише файли
        if (!item.isFile()) continue;

        // 5. Формуємо повний шлях до файлу для отримання його метаданих
        const fullPath = path.join(item.parentPath || directory, item.name);

        try {
          // 6. Отримуємо статистику конкретного файлу
          const fileStats = await fs.stat(fullPath);
          const exp = path.extname(item.name).toLocaleLowerCase() || "(other)";
          const size = fileStats.size;
          const mtimeMs = fileStats.mtimeMs;
          const ageDays = (now - mtimeMs) / MS_IN_DAY;

          // 7. Оновлюємо загальні лічильники
          stats.totalFiles++;
          stats.totalSize += size;

          // 8. Оновлюємо статистику за типом файлу
          const typeStat = stats.byType.get(exp) || { count: 0, totalSize: 0 };
          typeStat.count++;
          typeStat.totalSize += size;
          stats.byType.set(exp, typeStat);

          // 9. Розподіляємо файл за віковими
          if (ageDays <= 7) stats.age.last7++;
          else if (ageDays <= 30) stats.age.last30++;
          else if (ageDays > 90) stats.age.older90++;

          // 10. Зберігаємо дані для пошуку найбільших файлів
          stats.largestFiles.push({ path: item.name, size });

          // 11. Перевіряємо, чи є цей файл найстарішим
          if (mtimeMs < stats.oldestFile.mtimeMs) {
            stats.oldestFile = {
              path: item.name,
              mtimeMs,
              ageDays: Math.round(ageDays),
            };
          }

          // 12. Емітимо подію знаходження файлу для оновлення прогрес-бару
          this.emit("file-found", { path: fullPath, size });
        } catch (err) {
          // Ігноруємо помилки доступу до окремих файлів, щоб не зупиняти весь процес
          if (err.code === "ENOENT" || err.code === "EACCES") {
            this.emit("scan-warning", `Skipped ${fullPath} (${err.code})`);
          } else {
            throw err;
          }
        }
      }

      // 13. Сортуємо файли за розміром та залишаємо лише топ-3
      stats.largestFiles = stats.largestFiles
        .sort((a, b) => b.size - a.size)
        .slice(0, 3);

      // 14. Сповіщаємо про завершення та передаємо зібрані дані
      this.emit("scan-complete", stats);
    } catch (error) {
      // 15. Перехоплюємо критичні помилки (наприклад, неіснуюча коренева директорія)
      this.emit("error", error);
      throw error;
    }
  }
}
