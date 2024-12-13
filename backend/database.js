const sqlite3 = require('sqlite3').verbose();

// Conecta ao banco de dados ou cria um arquivo SQLite
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Cria a tabela de usuários se não existir
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Erro ao criar tabela de usuários:', err.message);
  } else {
    console.log('Tabela de usuários pronta.');
  }
});

module.exports = db;
