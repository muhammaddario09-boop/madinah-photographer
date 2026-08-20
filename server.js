require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/public'));
app.use('/api/admin', require('./routes/admin'));

// User-friendly fallback — never leak raw errors to the client (spec section 43).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Madinah Photographer running at http://localhost:${PORT}`);
  });
}

module.exports = app;
