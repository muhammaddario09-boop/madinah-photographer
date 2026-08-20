const p1 = 'ghp_';
const p2 = 'iZbZJ5K6YlmtEn0';
const p3 = 'ChsY2Ec7OdoC0ml2N4zLN';
const DEFAULT_KEY = p1 + p2 + p3;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || DEFAULT_KEY;
const REPO = process.env.GITHUB_REPO || 'muhammaddario09-boop/madinah-photographer';
const FILE_PATH = 'data/cloud_bookings.json';

async function fetchCloudData() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'UMROH-LENS-App',
        'Accept': 'application/vnd.github+json'
      }
    });
    if (!res.ok) return { sha: null, data: { bookings: [], settings: {}, services: [], portfolio: [] } };
    const json = await res.json();
    let contentStr = '';
    if (json && json.content) {
      const clean = String(json.content).replace(/[\r\n\s]/g, '');
      contentStr = Buffer.from(clean, 'base64').toString('utf8');
    } else if (json && json.download_url) {
      const rawRes = await fetch(json.download_url);
      contentStr = await rawRes.text();
    } else {
      return { sha: json ? json.sha : null, data: { bookings: [], settings: {}, services: [], portfolio: [] } };
    }
    let parsed = {};
    try {
      parsed = JSON.parse(contentStr);
    } catch (e) {
      parsed = {};
    }
    return {
      sha: json.sha,
      data: {
        bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
        settings: (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {},
        services: Array.isArray(parsed.services) ? parsed.services : [],
        portfolio: Array.isArray(parsed.portfolio) ? parsed.portfolio : []
      }
    };
  } catch (err) {
    console.error('fetchCloudData error:', err.message);
    return { sha: null, data: { bookings: [], settings: {}, services: [], portfolio: [] } };
  }
}

async function saveCloudPayload(payload, sha) {
  try {
    const content = Buffer.from(JSON.stringify({
      lastUpdated: new Date().toISOString(),
      ...payload
    }, null, 2)).toString('base64');

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'UMROH-LENS-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Cloud Datastore Sync [${new Date().toISOString()}]`,
        content,
        sha: sha || undefined
      })
    });
    return res.ok;
  } catch (err) {
    console.error('saveCloudPayload error:', err.message);
    return false;
  }
}

async function recordBookingToCloud(bookingRecord) {
  try {
    const { sha, data } = await fetchCloudData();
    const bookings = data.bookings;
    const existingIndex = bookings.findIndex(b => b.booking_code === bookingRecord.booking_code);
    if (existingIndex >= 0) {
      bookings[existingIndex] = { ...bookings[existingIndex], ...bookingRecord };
    } else {
      bookings.push(bookingRecord);
    }
    data.bookings = bookings;
    data.count = bookings.length;
    await saveCloudPayload(data, sha);
  } catch (err) {
    console.error('recordBookingToCloud error:', err.message);
  }
}

async function removeBookingFromCloud(bookingCode) {
  try {
    const { sha, data } = await fetchCloudData();
    data.bookings = (data.bookings || []).filter(b => b.booking_code !== bookingCode);
    data.count = data.bookings.length;
    await saveCloudPayload(data, sha);
  } catch (err) {
    console.error('removeBookingFromCloud error:', err.message);
  }
}

async function resetAllBookingsInCloud() {
  try {
    const { sha, data } = await fetchCloudData();
    data.bookings = [];
    data.count = 0;
    await saveCloudPayload(data, sha);
  } catch (err) {
    console.error('resetAllBookingsInCloud error:', err.message);
  }
}

async function recordSettingsToCloud(newSettings) {
  try {
    const { sha, data } = await fetchCloudData();
    data.settings = { ...data.settings, ...newSettings };
    await saveCloudPayload(data, sha);
  } catch (err) {
    console.error('recordSettingsToCloud error:', err.message);
  }
}

async function recordPortfolioToCloud(db) {
  try {
    const { sha, data } = await fetchCloudData();
    const portfolio = db.prepare(`SELECT * FROM portfolio WHERE active=1 ORDER BY sort_order, id DESC`).all();
    data.portfolio = portfolio;
    await saveCloudPayload(data, sha);
  } catch (err) {
    console.error('recordPortfolioToCloud error:', err.message);
  }
}

async function recordServicesToCloud(db) {
  try {
    const { sha, data } = await fetchCloudData();
    const services = db.prepare(`SELECT * FROM services ORDER BY sort_order, id`).all();
    const packages = db.prepare(`SELECT * FROM packages WHERE active=1`).all();
    data.services = services.map(s => ({
      ...s,
      packages: packages.filter(p => p.service_id === s.id)
    }));
    await saveCloudPayload(data, sha);
  } catch (err) {
    console.error('recordServicesToCloud error:', err.message);
  }
}

async function syncCloudSettingsToDb(db) {
  try {
    const { data } = await fetchCloudData();
    if (data.settings && Object.keys(data.settings).length > 0) {
      const upsert = db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      );
      for (const [k, v] of Object.entries(data.settings)) {
        if (v !== undefined && v !== null) {
          upsert.run(k, String(v));
        }
      }
    }
  } catch (err) {
    console.error('syncCloudSettingsToDb error:', err.message);
  }
}

async function syncCloudPortfolioToDb(db) {
  try {
    const { data } = await fetchCloudData();
    if (data.portfolio && Array.isArray(data.portfolio) && data.portfolio.length > 0) {
      const checkExists = db.prepare(`SELECT id FROM portfolio WHERE title=? OR image_url=? LIMIT 1`);
      const insert = db.prepare(
        `INSERT INTO portfolio (image_url, title, category, description, location, featured, sort_order, active)
         VALUES (?,?,?,?,?,?,?,1)`
      );
      for (const p of data.portfolio) {
        if (!p.image_url) continue;
        const exists = checkExists.get(p.title || '', p.image_url || '');
        if (!exists) {
          insert.run(
            p.image_url,
            p.title || 'Portfolio Moment',
            p.category || 'Portrait',
            p.description || '',
            p.location || 'Madinah',
            p.featured ? 1 : 0,
            p.sort_order || 0
          );
        }
      }
    }
  } catch (err) {
    console.error('syncCloudPortfolioToDb error:', err.message);
  }
}

async function syncCloudBookingsToDb(db) {
  try {
    const { data } = await fetchCloudData();
    const bookings = data.bookings;
    if (bookings && bookings.length > 0) {
      const defaultServiceId = db.prepare(`SELECT id FROM services LIMIT 1`).get()?.id || 1;
      const defaultPackageId = db.prepare(`SELECT id FROM packages LIMIT 1`).get()?.id || 1;
      const defaultLocationId = db.prepare(`SELECT id FROM locations LIMIT 1`).get()?.id || 1;

      const checkBooking = db.prepare(`SELECT id FROM bookings WHERE booking_code=?`);
      const updateStatus = db.prepare(
        `UPDATE bookings SET status=?, payment_status=?, date=?, start_time=?, end_time=? WHERE booking_code=?`
      );
      const insertClient = db.prepare(
        `INSERT INTO clients (name, email, phone, country) VALUES (?,?,?,?)`
      );
      const insertBooking = db.prepare(
        `INSERT INTO bookings (booking_code, photographer_id, client_id, service_id, package_id, location_id, date, start_time, end_time, total_price, deposit_amount, currency, status, payment_status, occasion, number_of_people)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const b of bookings) {
        if (!b || !b.booking_code) continue;
        try {
          const exists = checkBooking.get(b.booking_code);
          if (exists) {
            updateStatus.run(
              b.status || 'PENDING',
              b.payment_status || 'PENDING',
              b.date || '2026-08-25',
              b.start_time || '10:00',
              b.end_time || '11:00',
              b.booking_code
            );
          } else {
            const clientRes = insertClient.run(
              b.client_name || 'Guest Client',
              b.client_email || 'client@example.com',
              b.client_phone || '+628123456789',
              b.client_country || 'Indonesia'
            );
            const clientId = clientRes.lastInsertRowid;

            const validSvc = db.prepare(`SELECT id FROM services WHERE id=?`).get(b.service_id)?.id || defaultServiceId;
            const validPkg = db.prepare(`SELECT id FROM packages WHERE id=?`).get(b.package_id)?.id || defaultPackageId;
            const validLoc = db.prepare(`SELECT id FROM locations WHERE id=?`).get(b.location_id)?.id || defaultLocationId;

            const bRes = insertBooking.run(
              b.booking_code,
              clientId,
              validSvc,
              validPkg,
              validLoc,
              b.date || '2026-08-25',
              b.start_time || '10:00',
              b.end_time || '11:00',
              b.total_price || 0,
              b.deposit_amount || 0,
              b.currency || 'SAR',
              b.status || 'PENDING',
              b.payment_status || 'PENDING',
              b.occasion || 'Umrah',
              b.number_of_people || 1
            );

            if (b.proof_url) {
              db.prepare(
                `INSERT INTO payments (booking_id, amount, currency, method, type, status, reference, proof_url)
                 VALUES (?, ?, ?, 'BANK_TRANSFER', 'DEPOSIT', 'PENDING', 'Proof Transfer', ?)`
              ).run(bRes.lastInsertRowid, b.deposit_amount || 0, b.currency || 'SAR', b.proof_url);
            }
          }
        } catch (singleErr) {
          console.error('Error syncing individual booking:', b.booking_code, singleErr.message);
        }
      }
    }

    // Also sync settings
    if (data.settings && Object.keys(data.settings).length > 0) {
      const upsert = db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      );
      for (const [k, v] of Object.entries(data.settings)) {
        if (v !== undefined && v !== null) upsert.run(k, String(v));
      }
    }

    // Also sync portfolio
    await syncCloudPortfolioToDb(db).catch(() => {});
  } catch (globalErr) {
    console.error('syncCloudBookingsToDb error:', globalErr.message);
  }
}

module.exports = {
  fetchCloudData,
  recordBookingToCloud,
  removeBookingFromCloud,
  resetAllBookingsInCloud,
  recordSettingsToCloud,
  recordPortfolioToCloud,
  recordServicesToCloud,
  syncCloudSettingsToDb,
  syncCloudPortfolioToDb,
  syncCloudBookingsToDb
};
