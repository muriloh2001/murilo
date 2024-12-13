const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer'); // Para upload de arquivos
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const http = require('http'); // Importando http para criar o servidor
const socketIo = require('socket.io'); // Importando socket.io

const app = express();
const server = http.createServer(app); // Usando http.createServer para usar com Socket.io
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000', // Permite conexões do frontend
    methods: ['GET', 'POST'], // Permite apenas os métodos necessários
  },
});

const PORT = 5000;

// Verifica se JWT_SECRET está configurado
if (!process.env.JWT_SECRET) {
  console.error('ERRO: JWT_SECRET não definido no arquivo .env');
  process.exit(1);
}

// Configuração do SQLite (banco persistente)
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Certifica-se de que a pasta 'uploads/' existe
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log('Diretório "uploads/" criado.');
}

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// Criação das tabelas, se não existirem
db.serialize(() => {
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

  db.run(`
    CREATE TABLE IF NOT EXISTS mercadorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      height REAL NOT NULL,
      width REAL NOT NULL,
      status TEXT NOT NULL,
      image TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Erro ao criar tabela de mercadorias:', err.message);
    } else {
      console.log('Tabela de mercadorias pronta.');
    }
  });
});

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads')); // Servir arquivos estáticos

// Rota de registro
app.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Nome de usuário e senha são obrigatórios.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO users (username, password) VALUES (?, ?)`,
    [username, hashedPassword],
    (err) => {
      if (err) {
        return res.status(400).json({ message: 'Usuário já existe ou erro no registro.' });
      }
      res.json({ message: 'Usuário registrado com sucesso!' });
    }
  );
});

// Rota de login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Nome de usuário e senha são obrigatórios.' });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Erro interno no servidor.' });
    }
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });
    res.json({ token });
  });
});

// Middleware para verificar token
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(403).json({ message: 'Token não fornecido.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token inválido.' });
    req.user = user;
    next();
  });
}

// Rota para cadastrar mercadorias
app.post('/mercadorias', authenticateToken, upload.single('image'), (req, res) => {
  const { name, price, height, width, status } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!name || !price || !height || !width || !status) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
  }

  db.run(
    `INSERT INTO mercadorias (name, price, height, width, status, image) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, price, height, width, status, image],
    function (err) {
      if (err) {
        return res.status(500).json({ message: 'Erro ao cadastrar mercadoria.' });
      }
      // Emitir evento para os clientes conectados
      io.emit('newMercadoria', { id: this.lastID, name, price, height, width, status, image });
      res.status(201).json({ message: 'Mercadoria cadastrada com sucesso!', id: this.lastID });
    }
  );
});

// Rota para obter todas as mercadorias
app.get('/mercadorias', (req, res) => {
  db.all(`SELECT * FROM mercadorias`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao buscar mercadorias.' });
    }
    res.json(rows);
  });
});

// Configuração do Socket.io para comunicação em tempo real
io.on('connection', (socket) => {
  console.log('Usuário conectado');

  // Evento de desconexão
  socket.on('disconnect', () => {
    console.log('Usuário desconectado');
  });

  // Envio de uma mensagem para o cliente
  socket.emit('message', 'Bem-vindo ao servidor de WebSockets!');

  // Exemplo de recebimento de mensagens do cliente
  socket.on('sendMessage', (message) => {
    console.log('Mensagem recebida: ', message);
    // Emitir para todos os clientes conectados
    io.emit('newMessage', message);
  });
});

// Inicia o servidor
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
