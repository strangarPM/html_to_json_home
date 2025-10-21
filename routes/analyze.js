import express from 'express';
import { analyzeHtml } from '../controllers/analyzeController.js';

const router = express.Router();

router.post('/', analyzeHtml);

export default router;


