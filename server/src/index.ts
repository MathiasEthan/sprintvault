import { app } from './app';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 SprintVault Server running on http://localhost:${PORT}`);
  console.log(`🔒 Relational SQLite DB initialized`);
  console.log(`👥 Seeded 5 Users: 1 Team Lead Manager + 4 Developers`);
  console.log(`📦 Git Integration active`);
  console.log(`===============================================`);
});
