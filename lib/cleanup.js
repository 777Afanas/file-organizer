import fs from "fs/promises";
import path from "path";
import EventEmitter from "events";
import { formatSize } from "./utils.js";

export class Cleanup extends EventEmitter {
  constructor() {
    super();
    this.filesToDelete = [];
    this.totalSize = 0;
  }

  async run(directory, daysThreshold, confirm) {
    // 1. Сповіщаємо головний файл про старт (він виведе перші логи)
    this.emit("cleanup-start", { directory });

    // 2. Скануємо директорію
    await this.scanDirectory(directory, daysThreshold);

    if (this.filesToDelete.length === 0) {
      console.log("No files found that match the criteria.");
      this.emit("cleanup-complete", { deletedCount: 0 });
      return;
    }

    // 3. Виводимо список знайдених файлів (головний файл цього не робить, тому залишаємо тут)
    console.log(`Found ${this.filesToDelete.length} files to delete:\n`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const displayLimit = 3;
    for (
      let i = 0;
      i < Math.min(this.filesToDelete.length, displayLimit);
      i++
    ) {
      const file = this.filesToDelete[i];
      const dateStr = file.mtime.toISOString().split("T")[0];
      console.log(`${file.name}`);
      console.log(`  Size: ${formatSize(file.size)}`);
      console.log(`  Modified: ${file.daysOld} days ago (${dateStr})\n`);
    }

    if (this.filesToDelete.length > displayLimit) {
      console.log(
        `... (${this.filesToDelete.length - displayLimit} more files)`,
      );
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
      `Total: ${this.filesToDelete.length} files (${formatSize(this.totalSize)})\n`,
    );

    // 4. Логіка видалення або попереднього перегляду
    if (!confirm) {
      // Dry run завершується тут, головний файл сам виведе попередження
      this.emit("cleanup-complete", { deletedCount: 0 });
    } else {
      // Додано formatSize(this.totalSize) та \n на початку для точного збігу
      console.log(
        `\n⚠️  DELETING ${this.filesToDelete.length} files (${formatSize(this.totalSize)}). This action cannot be undone!`,
      );

      let deletedCount = 0;
      for (const file of this.filesToDelete) {
        await fs.unlink(file.path);
        deletedCount++;

        // Передаємо current та total для drawProgressBar у головному файлі
        this.emit("file-deleted", {
          current: deletedCount,
          total: this.filesToDelete.length,
        });
      }

      // Передаємо freedSize для фінального повідомлення
      this.emit("cleanup-complete", {
        deletedCount,
        freedSize: this.totalSize,
      });
    }
  }

  async scanDirectory(dir, threshold) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, threshold);
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        const fileAgeMs = Date.now() - stats.mtime.getTime();
        const daysOld = Math.floor(fileAgeMs / (1000 * 60 * 60 * 24));

        if (daysOld > threshold) {
          this.filesToDelete.push({
            name: entry.name,
            path: fullPath,
            size: stats.size,
            mtime: stats.mtime,
            daysOld: daysOld,
          });
          this.totalSize += stats.size;
        }
      }
    }
  }
}
