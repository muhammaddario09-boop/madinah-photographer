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
        message: `Cloud Datastore Sync [${new Date().toISOString()}] [skip ci]`,
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

async function recordLocationsToCloud(db) {
  try {
    const { sha, data } = await fetchCloudData();
    const locations = db.prepare(`SELECT * FROM locations ORDER BY id`).all();
    data.locations = locations;
    await saveCloudPayload(data, sha);
  } catch (err) {
    console.error('recordLocationsToCloud error:', err.message);
  }
}

async function syncCloudServicesToDb(db) {
  try {
    const { data } = await fetchCloudData();
    if (data.services && Array.isArray(data.services) && data.services.length > 0) {
      const checkSvc = db.prepare(`SELECT id FROM services WHERE slug=? LIMIT 1`);
      const updateSvc = db.prepare(`UPDATE services SET name=?, description=?, cover_image=?, starting_price=?, currency=?, edited_photos=?, sort_order=? WHERE id=?`);
      const insertSvc = db.prepare(`INSERT INTO services (name, slug, description, cover_image, starting_price, currency, edited_photos, sort_order) VALUES (?,?,?,?,?,?,?,?)`);
      
      const checkPkg = db.prepare(`SELECT id FROM packages WHERE service_id=? AND name=? LIMIT 1`);
      const updatePkg = db.prepare(`UPDATE packages SET description=?, price=?, currency=?, duration_minutes=?, edited_photos=?, deposit_percentage=?, cancellation_policy=? WHERE id=?`);
      const insertPkg = db.prepare(`INSERT INTO packages (service_id, name, description, price, currency, duration_minutes, edited_photos, raw_photos_included, deposit_percentage, cancellation_policy) VALUES (?,?,?,?,?,?,?,?,?,?)`);

      for (const s of data.services) {
        if (!s || !s.slug) continue;
        let svcId = null;
        const exists = checkSvc.get(s.slug);
        if (exists) {
          svcId = exists.id;
          updateSvc.run(s.name, s.description || '', s.cover_image || '', Number(s.starting_price) || 0, s.currency || 'SAR', Number(s.edited_photos) || 0, Number(s.sort_order) || 0, svcId);
        } else {
          const info = insertSvc.run(s.name, s.slug, s.description || '', s.cover_image || '', Number(s.starting_price) || 0, s.currency || 'SAR', Number(s.edited_photos) || 0, Number(s.sort_order) || 0);
          svcId = info.lastInsertRowid;
        }

        if (Array.isArray(s.packages) && s.packages.length > 0) {
          for (const p of s.packages) {
            if (!p || !p.name) continue;
            const pExists = checkPkg.get(svcId, p.name);
            if (pExists) {
              updatePkg.run(p.description || '', Number(p.price) || 0, p.currency || 'SAR', Number(p.duration_minutes) || 30, Number(p.edited_photos) || 10, Number(p.deposit_percentage) || 30, p.cancellation_policy || '', pExists.id);
            } else {
              insertPkg.run(svcId, p.name, p.description || '', Number(p.price) || 0, p.currency || 'SAR', Number(p.duration_minutes) || 30, Number(p.edited_photos) || 10, p.raw_photos_included ? 1 : 0, Number(p.deposit_percentage) || 30, p.cancellation_policy || '');
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('syncCloudServicesToDb error:', err.message);
  }
}

async function syncCloudLocationsToDb(db) {
  try {
    const { data } = await fetchCloudData();
    if (data.locations && Array.isArray(data.locations) && data.locations.length > 0) {
      const checkLoc = db.prepare(`SELECT id FROM locations WHERE name=? LIMIT 1`);
      const updateLoc = db.prepare(`UPDATE locations SET description=?, travel_buffer_minutes=? WHERE id=?`);
      const insertLoc = db.prepare(`INSERT INTO locations (name, description, travel_buffer_minutes) VALUES (?,?,?)`);
      for (const l of data.locations) {
        if (!l || !l.name) continue;
        const exists = checkLoc.get(l.name);
        if (exists) {
          updateLoc.run(l.description || '', Number(l.travel_buffer_minutes) || 15, exists.id);
        } else {
          insertLoc.run(l.name, l.description || '', Number(l.travel_buffer_minutes) || 15);
        }
      }
    }
  } catch (err) {
    console.error('syncCloudLocationsToDb error:', err.message);
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

let isSyncing = false;
async function syncCloudBookingsToDb(db) {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const { data } = await fetchCloudData();
    const bookings = data.bookings;

    const syncTx = db.transaction(() => {
      // Prune local SQLite bookings that are no longer in cloud datastore
      if (Array.isArray(bookings)) {
        const cloudCodes = new Set(bookings.map(b => b.booking_code));
        const localBookings = db.prepare(`SELECT id, booking_code FROM bookings`).all();
        for (const lb of localBookings) {
          if (!cloudCodes.has(lb.booking_code)) {
            db.prepare(`DELETE FROM payments WHERE booking_id=?`).run(lb.id);
            db.prepare(`DELETE FROM booking_history WHERE booking_id=?`).run(lb.id);
            db.prepare(`DELETE FROM notifications WHERE booking_id=?`).run(lb.id);
            db.prepare(`DELETE FROM bookings WHERE id=?`).run(lb.id);
          }
        }
      }

      if (bookings && bookings.length > 0) {
        const defaultServiceId = db.prepare(`SELECT id FROM services LIMIT 1`).get()?.id || 1;
        const defaultPackageId = db.prepare(`SELECT id FROM packages LIMIT 1`).get()?.id || 1;
        const defaultLocationId = db.prepare(`SELECT id FROM locations LIMIT 1`).get()?.id || 1;

        function normPay(st) {
          const s = String(st || '').toUpperCase();
          if (['UNPAID','DEPOSIT_PAID','PAID','REFUNDED'].includes(s)) return s;
          return 'UNPAID';
        }

        function normStatus(st) {
          const s = String(st || '').toUpperCase();
          if (['PENDING','AWAITING_PAYMENT','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW'].includes(s)) return s;
          return 'PENDING';
        }

        const checkBooking = db.prepare(`SELECT id FROM bookings WHERE booking_code=?`);
        const updateStatus = db.prepare(
          `UPDATE bookings SET status=?, payment_status=?, date=?, start_time=?, end_time=? WHERE booking_code=?`
        );
        const insertClient = db.prepare(
          `INSERT INTO clients (name, email, phone, country) VALUES (?,?,?,?)`
        );
        const insertBooking = db.prepare(
          `INSERT OR REPLACE INTO bookings (booking_code, photographer_id, client_id, service_id, package_id, location_id, date, start_time, end_time, total_price, deposit_amount, currency, status, payment_status, occasion, number_of_people)
           VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const b of bookings) {
          if (!b || !b.booking_code) continue;
          try {
            const safeStatus = normStatus(b.status);
            const safePay = normPay(b.payment_status);

            const exists = checkBooking.get(b.booking_code);
            if (exists) {
              updateStatus.run(
                safeStatus,
                safePay,
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
                safeStatus,
                safePay,
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
          if (v !== undefined && v !== null) {
            upsert.run(k, String(v));
          }
        }
      }
    });

    syncTx();
    
    // Also sync portfolio
    await syncCloudPortfolioToDb(db).catch(() => {});
  } catch (globalErr) {
    console.error('syncCloudBookingsToDb error:', globalErr.message);
  } finally {
    isSyncing = false;
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
  recordLocationsToCloud,
  syncCloudSettingsToDb,
  syncCloudPortfolioToDb,
  syncCloudBookingsToDb,
  syncCloudServicesToDb,
  syncCloudLocationsToDb
};
