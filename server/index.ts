import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initializeDb } from './db.js';
import { initGemini } from './services/gemini.js';
import { requirePin } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import entriesRoutes from './routes/entries.js';
import sharingRoutes from './routes/sharing.js';
import peersRoutes from './routes/peers.js';
import reflectionsRoutes from './routes/reflections.js';
import adminRoutes from './routes/admin.js';
import studyRoutes from './routes/study.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// Initialize database and AI
initializeDb();
initGemini();

// Public routes
app.use('/api/auth', authRoutes);

// Admin routes (has own auth middleware)
app.use('/api/admin', adminRoutes);

// Protected routes (require PIN)
app.use('/api/study', requirePin, studyRoutes);
app.use('/api/entries', requirePin, entriesRoutes);
app.use('/api/sharing', requirePin, sharingRoutes);
app.use('/api/peers', requirePin, peersRoutes);
app.use('/api/reflections', requirePin, reflectionsRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
