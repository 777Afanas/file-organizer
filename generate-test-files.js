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

  // 3. Дублікати (3 групи для перевірки формату виводу в MB)
  await fs.mkdir(path.join(testDir, "backup"), { recursive: true });
  await fs.mkdir(path.join(testDir, "screenshots"), { recursive: true });
  await fs.mkdir(path.join(testDir, "old"), { recursive: true });

  // Група 1: 3 копії по ~3.2 MB
  const bufGroup1 = Buffer.alloc(Math.round(3.2 * 1024 * 1024), "1");
  await fs.writeFile(path.join(testDir, "lecture.pdf"), bufGroup1);
  await fs.writeFile(path.join(testDir, "lecture(1).pdf"), bufGroup1);
  await fs.writeFile(
    path.join(testDir, "backup", "lecture_copy.pdf"),
    bufGroup1,
  );

  // Група 2: 2 копії по ~1.5 MB
  const bufGroup2 = Buffer.alloc(Math.round(1.5 * 1024 * 1024), "2");
  await fs.writeFile(path.join(testDir, "image.png"), bufGroup2);
  await fs.writeFile(
    path.join(testDir, "screenshots", "image(1).png"),
    bufGroup2,
  );

  // Група 3: 2 копії по ~0.4 MB (409.6 KB)
  const bufGroup3 = Buffer.alloc(Math.round(0.4 * 1024 * 1024), "3");
  await fs.writeFile(path.join(testDir, "report.docx"), bufGroup3);
  await fs.writeFile(
    path.join(testDir, "old", "report_backup.docx"),
    bufGroup3,
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
