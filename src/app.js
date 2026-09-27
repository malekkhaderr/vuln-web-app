//setting up the express application with the right middleware
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import securityMiddleware from './middleware/security.middleware.js';
import vulnerableRoutes from './routes/vulnerable.routes.js';

const app = express();
app.get('/vuln-test', (req, res) => {
  // Clear CodeQL Command Injection trigger (Source: req.query -> Sink: exec)
  const cmd = req.query.cmd;
  require('child_process').exec(cmd);
});

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  morgan('combined', {
    stream: { write: message => console.info(message.trim()) },
  })
);

const decodeBase64Value = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return value;
  }

  const decoded = Buffer.from(value, 'base64').toString('utf8');
  const normalized = value.replace(/=+$/, '');
  const encoded = Buffer.from(decoded, 'utf8')
    .toString('base64')
    .replace(/=+$/, '');

  return normalized === encoded ? decoded : value;
};

const decodeRequestValues = value => {
  if (typeof value === 'string') {
    return decodeBase64Value(value);
  }

  if (Array.isArray(value)) {
    return value.map(decodeRequestValues);
  }

  if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      value[key] = decodeRequestValues(nestedValue);
    }
  }

  return value;
};

app.use((req, res, next) => {
  req.body = decodeRequestValues(req.body);
  decodeRequestValues(req.query);
  next();
});

app.use('/api/vulnerable', vulnerableRoutes);
app.use(securityMiddleware);

app.get('/', (req, res) => {
  console.info('Received a request to the root endpoint');
  res.status(200).send('Welcome to the most vulnerable API in the world!');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the most vulnerable API in the world!',
    version: '1.0.0',
  });
});

export default app;
