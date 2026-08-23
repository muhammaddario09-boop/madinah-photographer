require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/apple-touch-icon*.png', (req, res) => res.status(204).end());

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers['x-admin-token'] || req.query.token;
  let token = null;

  if (authHeader) {
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = String(authHeader).trim();
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  // Verify token using the auth module
  const { verifyToken } = require('./lib/auth');
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }

  next();
};

// Clean URL routes for Admin and Public
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/bookings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'bookings.html')));
app.get('/admin/calendar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'calendar.html')));
app.get('/admin/portfolio', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'portfolio.html')));
app.get('/admin/services', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'services.html')));
app.get('/admin/locations', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'locations.html')));
app.get('/admin/availability', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'availability.html')));
app.get('/admin/settings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'settings.html')));

app.get('/services', (req, res) => res.sendFile(path.join(__dirname, 'public', 'services.html')));
app.get('/portfolio', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portfolio.html')));
app.get('/booking', (req, res) => res.sendFile(path.join(__dirname, 'public', 'booking.html')));
app.get('/my-booking', (req, res) => res.sendFile(path.join(__dirname, 'public', 'my-booking.html')));
app.get('/invoice', (req, res) => res.sendFile(path.join(__dirname, 'public', 'invoice.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'public', 'gallery.html')));
app.get('/ratecard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ratecard.html')));

app.use('/api', require('./routes/public'));
app.use('/api/admin', require('./routes/admin'));

// User-friendly fallback — never leak raw errors to the client (spec section 43).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL && require.main === module) {
  app.listen(PORT, () => {
    console.log(`Madinah Photographer running at http://localhost:${PORT}`);
  });
}

module.exports = app;
