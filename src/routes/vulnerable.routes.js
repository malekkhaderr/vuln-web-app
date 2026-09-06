import express from 'express';
import {
  searchUsers,
  greet,
  fetchUrl,
  getConfig,
  getFile,
  login,
} from '../controllers/vulnerable.controller.js';

const router = express.Router();

router.get('/users/search', searchUsers);
router.get('/greet', greet);
router.get('/fetch', fetchUrl);
router.get('/config', getConfig);
router.get('/files', getFile);
router.post('/login', login);

export default router;
