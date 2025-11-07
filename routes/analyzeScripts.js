import express from 'express';
import { analyzeViaScripts } from '../controllers/analyzeScriptsController.js';

const router = express.Router();

router.post('/', analyzeViaScripts);

export default router;

