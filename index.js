import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import {fileURLToPath} from 'url';
import captureRoutes from './routes/capture.js';
import analyzeRoutes from './routes/analyze.js';
import analyzeScriptsRoutes from './routes/analyzeScripts.js';
import renderRoutes from './routes/render.js';
import generateFlyerRoutes from './routes/generateFlyer.js';
import cors from 'cors';

const app = express();
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8050;

console.log(process.env.HOST);

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
// The 'cors' middleware is necessary to allow your front-end application
// to make requests to this API from a different origin (domain, port, etc.).
// The browser performs a "CORS check" to ensure the server allows this.
// The configuration below allows requests from any origin.
app.use(cors({origin: '*'}));
app.use(bodyParser.json({limit: '10mb'}));

// Serve screenshots folder as static files
const screenshotsDir = path.join(__dirname, 'screenshots');
app.use('/screenshots', express.static(screenshotsDir));

// Routes
app.use('/capture-div', captureRoutes);
app.use('/analyze-html', analyzeRoutes);
app.use('/analyze-html/scripts', analyzeScriptsRoutes);
app.use('/render-html', renderRoutes);
app.use('/generate-flyer', generateFlyerRoutes);

app.get('/', (req, res) => {
    const name = process.env.NAME || 'World';
    res.send(`Hello ${name}!`);
});

app.listen(PORT, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});
