import fsPromises from "fs/promises";
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { pipeline } from "stream/promises";

// Mapping розширень до категорій
const categories = {
  Documents: [".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"],
  Images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
  Archives: [".zip", ".rar", ".tar", ".gz", ".7z"],
  Code: [".js", ".py", ".java", ".cpp", ".html", ".css", ".json"],
  Videos: [".mp4", ".avi", ".mkv", ".mov", ".webm"],
  Other: [], // Для невідомих розширень
};

const LARGE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB у байтах

export class Organizer extends EventEmitter {
  constructor() {
    super();
    // Об'єкт для збору статистики
    this.stats = {
      Documents: { count: 0, size: 0 },
      Images: { count: 0, size: 0 },
      Archives: { count: 0, size: 0 },
      Code: { count: 0, size: 0 },
      Videos: { count: 0, size: 0 },
      Other: { count: 0, size: 0 },
    };
    this.totalCopied = 0;
    this.totalSize = 0;
    this.totalExpectedFiles = 0;
  }

  /**
   * Головний метод для організації файлів
   * @param {string} sourceDir - Вихідна директорія
   * @param {string} targetDir - Цільова директорія
   */
  async organize(sourceDir, targetDir) {
    try {
      // Перевіряємо, чи існує вихідна директорія і чи є до неї доступ
      await fsPromises.access(sourceDir);

      this.emit("organize-start", { source: sourceDir, target: targetDir });

      this.totalExpectedFiles = await this._countFiles(sourceDir, targetDir);

      // Створюємо структуру директорій у цільовій папці
      await this._createDirectories(targetDir);

      // Запускаємо рекурсивне сканування та копіювання
      await this._processDirectory(sourceDir, targetDir);

      return {
        categories: this.stats,
        totalFiles: this.totalCopied,
        totalSize: this.totalSize,
      };
    } catch (error) {
      this._handleFatalError(error, sourceDir, targetDir);
    }
  }

  /**
   * Метод для попереднього підрахунку файлів
   */
  async _countFiles(dir, targetDir) {
    let count = 0;
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && fullPath !== targetDir) {
        count += await this._countFiles(fullPath, targetDir);
      } else if (entry.isFile()) {
        count++;
      }
    }
    return count;
  }

  /**
   * Створює всі необхідні папки для категорій
   */
  async _createDirectories(targetDir) {
    for (const category of Object.keys(categories)) {
      const categoryPath = path.join(targetDir, category);
      await fsPromises.mkdir(categoryPath, { recursive: true });
      // Еміт створення категорії
      this.emit("category-created", { category });
    }
  }

  /**
   * Рекурсивно проходить по вихідній директорії
   */
  async _processDirectory(dir, targetDir) {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Уникаємо нескінченного циклу, якщо цільова папка знаходиться всередині вихідної
        if (fullPath !== targetDir) {
          await this._processDirectory(fullPath, targetDir);
        }
      } else if (entry.isFile()) {
        await this._handleFile(fullPath, entry.name, targetDir);
      }
    }
  }

  /**
   * Обробляє копіювання окремого файлу
   */
  async _handleFile(sourcePath, filename, targetDir) {
    try {
      const stat = await fsPromises.stat(sourcePath);
      const category = this._getCategory(filename);

      const baseTargetPath = path.join(targetDir, category, filename);
      const targetPath = await this._getUniquePath(baseTargetPath);

      // передаємо current та total для прогрес-бару
      this.emit("copy-start", {
        current: this.totalCopied + 1,
        total: this.totalExpectedFiles,
      });

      // Логіка вибору методу копіювання в залежності від розміру
      if (stat.size < LARGE_FILE_SIZE) {
        // Для файлів < 10 MB
        await fsPromises.copyFile(sourcePath, targetPath);
      } else {
        // Для файлів >= 10 MB використовуємо streams
        await pipeline(
          fs.createReadStream(sourcePath),
          fs.createWriteStream(targetPath),
        );
      }

      // Оновлюємо статистику
      this.stats[category].count++;
      this.stats[category].size += stat.size;
      this.totalCopied++;
      this.totalSize += stat.size;

      // Подія: успішне завершення копіювання
      this.emit("copy-complete", { source: sourcePath, target: targetPath });
    } catch (error) {
      // Подія: помилка копіювання окремого файлу (продовжуємо роботу з іншими)
      this.emit("copy-error", { source: sourcePath, error });
    }
  }

  /**
   * Визначає категорію на основі розширення
   */
  _getCategory(filename) {
    const ext = path.extname(filename).toLowerCase();
    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    return "Other";
  }

  /**
   * Генерує унікальне ім'я файлу, якщо такий вже існує (напр. file(1).pdf)
   */
  async _getUniquePath(targetPath) {
    let uniquePath = targetPath;
    let counter = 1;
    const ext = path.extname(targetPath);
    const name = path.basename(targetPath, ext);
    const dir = path.dirname(targetPath);

    while (true) {
      try {
        await fsPromises.access(uniquePath);
        // Якщо файл існує (не випала помилка), додаємо суфікс
        uniquePath = path.join(dir, `${name}(${counter})${ext}`);
        counter++;
      } catch (err) {
        if (err.code === "ENOENT") {
          // Файл не існує — шлях вільний
          return uniquePath;
        }
        throw err; // Інші непередбачувані помилки прокидаємо вище
      }
    }
  }

  /**
   * Обробка критичних помилок (наприклад, неіснуюча source директорія)
   */
  _handleFatalError(error, sourceDir, targetDir) {
    if (error.code === "ENOENT") {
      console.error(
        `\n❌ Error: Directory not found or inaccessible: ${error.path || sourceDir}`,
      );
    } else if (error.code === "EACCES") {
      console.error(
        `\n❌ Error: Permission denied: ${error.path || sourceDir}`,
      );
    } else {
      console.error(`\n❌ Unexpected error: ${error.message}`);
    }
    // Завершуємо процес з кодом помилки
    process.exit(1);
  }
}
