// legacy dev utility (kept for reference)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
db.note
  .count()
  .then((c) => {
    console.log("notes:", c);
    return db.$disconnect();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
