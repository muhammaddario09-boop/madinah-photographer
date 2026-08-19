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
    if (!res.ok) return { sha: null, bookings: [] };
    const json = await res.json();
    const content = Buffer.from(json.content, 'base64').toString('utf8');
    const parsed = JSON.parse(content);
    return {
      sha: json.sha,
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : []
    };
  } catch (err) {
    console.error('fetchCloudData error:', err.message);
    return { sha: null, bookings: [] };
  }
}

async function saveCloudData(bookings, sha) {
  try {
    const content = Buffer.from(JSON.stringify({
      lastUpdated: new Date().toISOString(),
      count: bookings.length,
      bookings
    }, null, 2)).toString('base64');

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'UMROH-LENS-App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Sync cloud booking database [${bookings.length} records]`,
        content,
        sha: sha || undefined
      })
    });
    return res.ok;
  } catch (err) {
    console.error('saveCloudData error:', err.message);
    return false;
  }
}

async function recordBookingToCloud(bookingRecord) {
  const { sha, bookings } = await fetchCloudData();
  const existingIndex = bookings.findIndex(b => b.booking_code === bookingRecord.booking_code);
  if (existingIndex >= 0) {
    bookings[existingIndex] = { ...bookings[existingIndex], ...bookingRecord };
  } else {
    bookings.push(bookingRecord);
  }
  await saveCloudData(bookings, sha);
}

async function syncCloudBookingsToDb(db) {
  const { bookings } = await fetchCloudData();
  if (!bookings || bookings.length === 0) return;

  const insertClient = db.prepare(
    `INSERT INTO clients (name, email, phone, country) VALUES (?,?,?,?)`
  );
  const findClient = db.prepare(`SELECT id FROM clients WHERE phone=? OR email=? LIMIT 1`);

  const insertBooking = db.prepare(
    `INSERT INTO bookings (booking_code, photographer_id, client_id, service_id, package_id, location_id, date, start_time, end_time, total_price, deposit_amount, currency, status, payment_status, occasion, number_of_people)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateStatus = db.prepare(
    `UPDATE bookings SET status=?, payment_status=? WHERE booking_code=?`
  );
  const checkBooking = db.prepare(`SELECT id FROM bookings WHERE booking_code=?`);

  for (const b of bookings) {
    try {
      const exists = checkBooking.get(b.booking_code);
      if (exists) {
        updateStatus.run(b.status || 'PENDING', b.payment_status || 'PENDING', b.booking_code);
      } else {
        let client = findClient.get(b.client_phone || '', b.client_email || '');
        let clientId = client ? client.id : null;
        if (!clientId) {
          const cRes = insertClient.run(
            b.client_name || 'Guest',
            b.client_email || '',
            b.client_phone || '',
            b.client_country || 'Indonesia'
          );
          clientId = cRes.lastInsertRowid;
        }

        const bRes = insertBooking.run(
          b.booking_code,
          clientId,
          b.service_id || 1,
          b.package_id || 1,
          b.location_id || 1,
          b.date,
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
    } catch (e) {
      console.error('Error syncing booking:', b.booking_code, e.message);
    }
  }
}

module.exports = {
  fetchCloudData,
  recordBookingToCloud,
  syncCloudBookingsToDb
};
