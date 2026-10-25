// Імпортуємо клас Command з бібліотеки commander для створення CLI-інтерфейсу
import { Command } from "commander";

// Імпортуємо класи з наших локальних модулів, кожен з яких наслідує EventEmitter
import { Scanner } from "./lib/scanner.js";
import { DuplicateFinder } from "./lib/duplicates.js";
import { Organizer } from "./lib/organizer.js";
import { Cleanup } from "./lib/cleanup.js";

// Імпортуємо допоміжні функції
import { drawProgressBar, formatSize, handleError } from "./lib/utils.js";

// Створюємо основний об'єкт програми
const program = new Command();

// Налаштовуємо базову інформацію про застосунок (виводиться при виклику --help)
program
  .name("file-organizer.js")
  .description("CLI tool for analiysis, sorting and cleaning of files")
  .version("1.0.0");

// ==========================================
// 1. Команда SCAN
// ==========================================

program
  .command("scan <directory>") // <directory> - обов'язковий аргумент
  .description(
    "recursive scanning of directories and collection of detailed statistics about files",
  )
  .action(async (directory) => {
    // Створюємо екземпляр класу сканера
    const scanner = new Scanner();
    let processedCount = 0;

    // Підписуємося на подію початку сканування
    scanner.on("scan-start", (data) => {
      console.log(`\n📂 Scanning: ${data.directory}`);
    });

    // Підписуємося на подію знаходження файлу для оновлення консолі
    scanner.on("file-found", () => {
      processedCount++;
      // Використовуємо \r для перезапису поточного рядка в консолі
      process.stdout.write(`\rProcessing... ${processedCount} files found`);
    });

    // Підписуємося на подію завершення для виводу результатів
    scanner.on("scan-complete", (stats) => {
      console.log(`\n\n📊 Scan Results:`);
      console.log(`----------------------------------------`);
      console.log(`Total files: ${stats.totalFiles}`);
      console.log(`Total size: ${formatSize(stats.totalSize)}`); // Використовуємо utils
      // Іншу детальну статистику клас Scanner має формувати та передавати в stats
    });

    // Запускаємо процес у блоці try/catch для перехоплення системних помилок
    try {
      await scanner.scan(directory);
    } catch (error) {
      handleError(error, directory); // Використовуємо ваш обробник з utils.js
    }
  });

// ==========================================
// 2. Команда DUPLICATES
// ==========================================
program
  .command("duplicates <directory>")
  .description("Search for duplicate files using SHA-256 hash")
  .action(async (directory) => {
    const finder = new DuplicateFinder();

    finder.on("scan-start", (data) => {
      console.log(`\n🔍 Searching for duplicates in: ${data.directory}`);
    });

    // Оновлення прогрес-бару під час хешування файлів
    finder.on("file-processed", (data) => {
      // data має містити current / total для drawProgressBar
      process.stdout.write(
        `\rCalculating hashes... ${drawProgressBar(data.current, data.total)}`,
      );
    });

    finder.on("duplicates-found", (results) => {
      // results має містити згруповані дані та підрахований wastedSpace
      console.log(
        `\n\nFound ${results.groupsCount} duplicate groups (${formatSize(results.wastedSpace)} wasted):\n`,
      );
      // Логіка перебору та виводу груп дублікатів має бути тут або в самому класі
    });

    try {
      await finder.find(directory);
    } catch (error) {
      handleError(error, directory);
    }
  });

// ==========================================
// 3. Команда ORGANIZE
// ==========================================
program
  .command("organize <directory>")
  .description("copying and sorting files by category")
  .requiredOption("-o, --output <target>", "Wholesome directory for saving") // Обов'язковий прапорець
  .action(async (directory, options) => {
    const organizer = new Organizer();

    organizer.on("organize-start", (data) => {
      console.log(`\n📦 Organizing: ${data.source}\nTarget: ${data.target}\n`);
    });

    organizer.on("category-created", (data) => {
      console.log(`  ✓ ${data.category}/`);
    });

    organizer.on("copy-start", (data) => {
      process.stdout.write(
        `\rCopying files... ${drawProgressBar(data.current, data.total)}`,
      );
    });

    organizer.on("organize-complete", (stats) => {
      console.log(`\n\n✅ Organization complete!\nSummary:`);
      // Вивід статистики по категоріях
    });

    try {
      // Передаємо і вихідну директорію, і цільову (з options.output)
      await organizer.organize(directory, options.output);
    } catch (error) {
      handleError(error, directory);
    }
  });

// ==========================================
// 4. Команда CLEANUP
// ==========================================
program
  .command("cleanup <directory>")
  .description("Looking for and delete old files with dry run mode support")
  .requiredOption("-d, --older-than <days>", "File age in days", parseInt) // parseInt одразу робить рядок числом
  .option("-c, --confirm", "Confirm actual deletion (otherwise Dry Run)") // Опціональний прапорець
  .action(async (directory, options) => {
    const cleanup = new Cleanup();

    cleanup.on("cleanup-start", (data) => {
      console.log(`\n🧹 Cleanup: ${data.directory}`);
      console.log(
        `Looking for files older than ${options.olderThan} days...\n`,
      );
    });

    cleanup.on("file-deleted", (data) => {
      process.stdout.write(
        `\rDeleting... ${drawProgressBar(data.current, data.total)}`,
      );
    });

    cleanup.on("cleanup-complete", (results) => {
      // Якщо користувач передав прапорець -c або --confirm
      if (options.confirm) {
        console.log(
          `\n\n✅ Cleanup complete! Deleted: ${results.deletedCount} files.`,
        );
      } else {
        console.log(`\n⚠️  DRY RUN MODE: No files were deleted.`);
        console.log(`To actually delete these files, run with --confirm flag.`);
      }
    });

    try {
      // Передає логічне значення confirm, щоб клас знав, чи видаляти файли
      await cleanup.run(directory, options.olderThan, !!options.confirm);
    } catch (error) {
      handleError(error, directory);
    }
  });

// ==========================================
// ЗАПУСК ПРОГРАМИ
// ==========================================
// Зчитуємо аргументи командного рядка (process.argv) та викликаємо відповідну дію
program.parse(process.argv);
