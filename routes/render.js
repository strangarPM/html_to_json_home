import express from 'express';
import { renderAndDescribe } from '../controllers/renderController.js';

const router = express.Router();

router.post('/', renderAndDescribe);

export default router;

