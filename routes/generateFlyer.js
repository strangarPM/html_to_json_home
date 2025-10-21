import express from 'express';
import { generateFlyer } from '../controllers/generateFlyerController.js';

const router = express.Router();

router.post('/', generateFlyer);

export default router;
