import fs from "fs/promises";
import path from "path";

const testDir = path.join(process.cwd(), "test-directory");

async function generateTestFiles() {
  await fs.mkdir(testDir, { recursive: true });

  // 1. Звичайні файли різних типів
  await fs.writeFile(path.join(testDir, "document.pdf"), "Dummy PDF content");
  await fs.writeFile(path.join(testDir, "script.js"), 'console.log("Hello");');

  // 2. Великий файл (імітація >10MB для перевірки streams)
  const largeBuf = Buffer.alloc(11 * 1024 * 1024, "A");
  await fs.writeFile(path.join(testDir, "large-video.mp4"), largeBuf);

  // 3. Дублікати
  await fs.writeFile(path.join(testDir, "image.png"), "Same image content");
  await fs.mkdir(path.join(testDir, "backup"), { recursive: true });
  await fs.writeFile(
    path.join(testDir, "backup", "image_copy.png"),
    "Same image content",
  );

  // 4. Старий файл (імітація віку 100 днів)
  const oldFilePath = path.join(testDir, "old_report.docx");
  await fs.writeFile(oldFilePath, "Old report content");
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 100);
  await fs.utimes(oldFilePath, pastDate, pastDate);

  console.log(
    '✅ The test directory "test-directory" has been successfully generated!',
  );
}

generateTestFiles().catch(console.error);
