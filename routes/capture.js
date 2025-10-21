import express from 'express';
import { captureDiv } from '../controllers/captureController.js';

const router = express.Router();

router.post('/', captureDiv);

export default router;
