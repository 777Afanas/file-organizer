import { EventEmitter } from "events";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { formatSize } from "./utils.js";

export class DuplicateFinder extends EventEmitter {
  /**
   * Обчислює SHA-256 хеш файлу за допомогою потокового читання (Streams),
   * щоб уникнути переповнення оперативної пам'яті на великих файлах.
   * @param {string} filePath - Повний шлях до файлу
   * @returns {Promise<string>} Hex-рядок SHA-256 хешу
   */

  calculateHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);

      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  /**
   * Рекурсивно сканує директорію, обчислює хеші файлів та знаходить дублікати.
   * @param {string} directory - Шлях до цільової директорії
   */

  async find(directory) {
    // Map<hash, { size: number, paths: string[] }>
    const hashGroups = new Map();

    try {
      // 1. Рекурсивно отримуємо список всіх елементів у директорії
      const items = await fsp.readdir(directory, {
        recursive: true,
        withFileTypes: true,
      });

      const files = items.filter((item) => item.isFile());
      const total = files.length;
      let current = 0;

      // 2. Сповіщаємо про початок сканування (слухається у file-organizer.js)
      this.emit("scan-start", { directory, total });

      // 3. Обробляємо кожен файл
      for (const item of files) {
        const fullPath = path.join(item.parentPath || directory, item.name);

        try {
          const fileStats = await fsp.stat(fullPath);
          const hash = await this.calculateHash(fullPath);

          if (!hashGroups.has(hash)) {
            hashGroups.set(hash, {
              size: fileStats.size,
              paths: [],
            });
          }

          hashGroups.get(hash).paths.push(fullPath);
        } catch (err) {
          // Пропускаємо окремі файли, до яких немає доступу або які зникли під час роботи
          if (err.code === "ENOENT" || err.code === "EACCES") {
            this.emit("scan-warning", `Skipped ${fullPath} (${err.code})`);
          } else {
            throw err;
          }
        } finally {
          // Оновлюємо прогрес-бар (у file-organizer.js очікується { current, total })
          current++;
          this.emit("file-processed", {
            current,
            total,
            file: fullPath,
          });
        }
      }
      // 4. Відбираємо тільки групи дублікатів (де кількість копій > 1)
      const duplicateGroups = [];
      let totalWastedSpace = 0;

      for (const [hash, data] of hashGroups.entries()) {
        if (data.paths.length > 1) {
          // Витрачене місце = розмір файлу * (загальна кількість копій - 1 оригінал)
          const groupWastedSpace = data.size * (data.paths.length - 1);
          totalWastedSpace += groupWastedSpace;

          duplicateGroups.push({
            hash,
            size: data.size,
            copies: data.paths.length,
            paths: data.paths,
            wastedSpace: groupWastedSpace,
          });
        }
      }

      // 5. Емітимо фінальні результати (file-organizer.js виводить загальний рядок Found X duplicate groups...)
      const results = {
        groupsCount: duplicateGroups.length,
        wastedSpace: totalWastedSpace,
        groups: duplicateGroups,
      };

      this.emit("duplicates-found", results);

      // 6. Виводимо детальну інформацію по кожній групі згідно з форматом ТЗ
      this.printDuplicateGroups(results);

      return results;
    } catch (error) {
      // Прокидаємо критичну помилку (наприклад, ENOENT/EACCES для кореневої директорії)
      // у блок try...catch файлу file-organizer.js, де викликається handleError()
      throw error;
    }
  }

  /**
   * Виводить детальний список груп дублікатів у консоль без дублювання заголовка з file-organizer.js
   * @param {{ groupsCount: number, wastedSpace: number, groups: Array }} results
   */
  printDuplicateGroups(results) {
    if (results.groups.length === 0) {
      console.log("✅ No duplicate files found.");
      return;
    }

    results.groups.forEach((group, index) => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(
        `Group ${index + 1} (${group.copies} copies, ${formatSize(group.size)} each):`,
      );
      console.log(`  SHA-256: ${group.hash.slice(0, 12)}...\n`);

      group.paths.forEach((filePath) => {
        console.log(`  📄 ${filePath}`);
      });

      console.log(`\n  Wasted space: ${formatSize(group.wastedSpace)}\n`);
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`💾 Total wasted space: ${formatSize(results.wastedSpace)}`);
  }
}
