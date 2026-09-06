//setting up the express application with the right middleware
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import securityMiddleware from './middleware/security.middleware.js';
import vulnerableRoutes from './routes/vulnerable.routes.js';

const app = express();

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
