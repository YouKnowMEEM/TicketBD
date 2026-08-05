require('dotenv').config(); // MUST BE AT THE VERY TOP
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('./db');
const { authenticateToken, authorizeSelfParam, authorizeSelfBody } = require('./middleware/auth');

if (!process.env.JWT_SECRET) {
    console.error("🛑 JWT_SECRET is missing from your .env file.");
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// Helper: mint a signed session token for a user row
function issueToken(user) {
    return jwt.sign(
        { userId: user.user_id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Helper: "HH:MM:SS" -> minutes since midnight (fractional seconds allowed).
function timeStrToMinutes(t) {
    if (!t) return null;
    const [h, m, s] = String(t).split(':').map(Number);
    return h * 60 + m + (s || 0) / 60;
}

// Walks a train's Stoppage rows (in stoppage_id order) and returns cumulative minute offsets
async function getCumulativeSchedule(db, trainId) {
    const [stops] = await db.query(
        `SELECT station_id, arrival_time, departure_time
         FROM Stoppage
         WHERE train_id = ?
         ORDER BY stoppage_id ASC`,
        [trainId]
    );

    if (stops.length < 2) return null;

    const originDeparture = timeStrToMinutes(stops[0].departure_time);
    if (originDeparture === null) return null;

    let cumulative = 0;
    let clock = originDeparture;
    const schedule = [{ station_id: stops[0].station_id, arrivalOffset: null, departureOffset: 0 }];

    for (let i = 1; i < stops.length; i++) {
        const arrMin = timeStrToMinutes(stops[i].arrival_time);
        const depMin = timeStrToMinutes(stops[i].departure_time);

        let arrOffset = null;
        if (arrMin !== null) {
            let delta = arrMin - clock;
            while (delta < 0) delta += 24 * 60;
            cumulative += delta;
            arrOffset = cumulative;
            clock = arrMin;
        }

        let depOffset = arrOffset;
        if (depMin !== null) {
            let delta = depMin - clock;
            while (delta < 0) delta += 24 * 60;
            cumulative += delta;
            depOffset = cumulative;
            clock = depMin;
        }

        schedule.push({ station_id: stops[i].station_id, arrivalOffset: arrOffset, departureOffset: depOffset });
    }

    return schedule;
}

function scheduleBoundary(schedule, stationId, boundary) {
    const entry = schedule.find(s => s.station_id === Number(stationId));
    if (!entry) return null;
    const offset = boundary === 'start'
        ? (entry.departureOffset ?? entry.arrivalOffset)
        : (entry.arrivalOffset ?? entry.departureOffset);
    if (offset === null || offset === undefined) return null;
    return offset;
}

function buildInterval(schedule, startStationId, endStationId) {
    const s = scheduleBoundary(schedule, startStationId, 'start');
    const e = scheduleBoundary(schedule, endStationId, 'end');
    if (s === null || e === null || s >= e) return null;
    return { s, sId: Number(startStationId), e, eId: Number(endStationId) };
}

function intervalsOverlap(a, b) {
    return a.s < b.e && b.s < a.e;
}

function subtractInterval(remainingList, piece) {
    const result = [];
    for (const iv of remainingList) {
        const os = iv.s >= piece.s ? iv.s : piece.s;
        const osId = iv.s >= piece.s ? iv.sId : piece.sId;
        const oe = iv.e <= piece.e ? iv.e : piece.e;
        const oeId = iv.e <= piece.e ? iv.eId : piece.eId;

        if (os >= oe) { result.push(iv); continue; }

        if (iv.s < os) result.push({ s: iv.s, sId: iv.sId, e: os, eId: osId });
        if (oe < iv.e) result.push({ s: oe, sId: oeId, e: iv.e, eId: iv.eId });
    }
    return result;
}

function intersectWithRemaining(remainingList, query) {
    const pieces = [];
    for (const iv of remainingList) {
        const os = iv.s >= query.s ? iv.s : query.s;
        const osId = iv.s >= query.s ? iv.sId : query.sId;
        const oe = iv.e <= query.e ? iv.e : query.e;
        const oeId = iv.e <= query.e ? iv.eId : query.eId;
        if (os < oe) pieces.push({ s: os, sId: osId, e: oe, eId: oeId });
    }
    return pieces;
}

async function getSegmentFraction(db, trainId, startStationId, endStationId) {
    const schedule = await getCumulativeSchedule(db, trainId);
    if (!schedule) return null;

    const startEntry = schedule.find(s => s.station_id === Number(startStationId));
    const endEntry = schedule.find(s => s.station_id === Number(endStationId));
    if (!startEntry || !endEntry) return null;

    const startOffset = startEntry.departureOffset;
    const endOffset = endEntry.arrivalOffset ?? endEntry.departureOffset;
    const last = schedule[schedule.length - 1];
    const totalOffset = last.arrivalOffset ?? last.departureOffset;

    if (startOffset === null || endOffset === null || !totalOffset || totalOffset <= 0) return null;

    const segmentDuration = endOffset - startOffset;
    if (segmentDuration <= 0) return null;

    return Math.min(1, segmentDuration / totalOffset);
}

async function calculateSegmentFare(db, trainId, startStationId, endStationId, basePrice) {
    const fraction = await getSegmentFraction(db, trainId, startStationId, endStationId);
    if (fraction === null) return null;
    return Math.round(Number(basePrice) * fraction * 100) / 100;
}

function overlapStatusBySeat(schedule, queryStart, queryEnd, activeBookings) {
    const result = new Map();
    if (activeBookings.length === 0) return result;

    const query = schedule ? buildInterval(schedule, queryStart, queryEnd) : null;

    for (const b of activeBookings) {
        let overlaps = false;
        if (schedule && query) {
            const other = buildInterval(schedule, b.start_station_id, b.end_station_id);
            overlaps = other ? intervalsOverlap(query, other) : true;
        } else {
            overlaps = true; // fallback if no schedule query interval
        }
        if (!overlaps) continue;
        const key = Number(b.seat_id);
        const entry = result.get(key) || { booked: false, pending: false };
        if (b.status === 'CONFIRMED') entry.booked = true; else entry.pending = true;
        result.set(key, entry);
    }
    return result;
}

async function getOverlapStatusForTrain(db, trainId, journeyDate, queryStart, queryEnd) {
    const [activeBookings] = await db.query(
        `SELECT seat_id, start_station_id, end_station_id, status
         FROM Booking
         WHERE train_id = ? AND journey_date = ?
           AND (status = 'CONFIRMED' OR (status = 'PENDING' AND booking_time > DATE_SUB(NOW(), INTERVAL 4 MINUTE)))`,
        [trainId, journeyDate]
    );
    const schedule = await getCumulativeSchedule(db, trainId);

    // If queryStart or queryEnd are not provided, default to full route (first and last station)
    let sStart = queryStart;
    let sEnd = queryEnd;
    if (!sStart || !sEnd) {
        if (schedule && schedule.length >= 2) {
            sStart = schedule[0].station_id;
            sEnd = schedule[schedule.length - 1].station_id;
        }
    }

    return overlapStatusBySeat(schedule, sStart, sEnd, activeBookings);
}

// Process resale overlaps when a new booking is confirmed
async function processResaleOverlaps(connection, { trainId, journeyDate, seatId, startStationId, endStationId, newUserId }) {
    const [candidates] = await connection.query(`
        SELECT rr.refund_request_id, t.price_paid AS original_price,
               b.start_station_id AS orig_start, b.end_station_id AS orig_end
        FROM RefundRequest rr
                 JOIN Ticket t ON rr.ticket_id = t.ticket_id
                 JOIN Booking b ON t.booking_id = b.booking_id
        WHERE b.seat_id = ? AND b.journey_date = ?
          AND rr.status IN ('PENDING_RESALE', 'PARTIALLY_RESOLD')
        FOR UPDATE
    `, [seatId, journeyDate]);

    if (candidates.length === 0) return;

    const schedule = await getCumulativeSchedule(connection, trainId);
    if (!schedule) return;

    const newInterval = buildInterval(schedule, startStationId, endStationId);
    if (!newInterval) return;

    for (const rr of candidates) {
        const originalInterval = buildInterval(schedule, rr.orig_start, rr.orig_end);
        if (!originalInterval) continue;
        const originalDuration = originalInterval.e - originalInterval.s;
        if (originalDuration <= 0) continue;

        const [existingResales] = await connection.query(
            `SELECT start_station_id, end_station_id FROM ResaleSegment WHERE refund_request_id = ?`,
            [rr.refund_request_id]
        );

        let remaining = [originalInterval];
        for (const seg of existingResales) {
            const iv = buildInterval(schedule, seg.start_station_id, seg.end_station_id);
            if (iv) remaining = subtractInterval(remaining, iv);
        }

        const overlapPieces = intersectWithRemaining(remaining, newInterval);
        if (overlapPieces.length === 0) continue;

        const farePerUnit = Number(rr.original_price) / originalDuration;

        for (const piece of overlapPieces) {
            const allocatedPrice = Math.round(farePerUnit * (piece.e - piece.s) * 100) / 100;
            await connection.query(`
                INSERT INTO ResaleSegment (refund_request_id, new_user_id, start_station_id, end_station_id, allocated_price)
                VALUES (?, ?, ?, ?, ?)
            `, [rr.refund_request_id, newUserId, piece.sId, piece.eId, allocatedPrice]);
            remaining = subtractInterval(remaining, piece);
        }

        const stillRemainingDuration = remaining.reduce((sum, iv) => sum + (iv.e - iv.s), 0);

        const [totalRows] = await connection.query(
            `SELECT COALESCE(SUM(allocated_price), 0) AS totalRefunded FROM ResaleSegment WHERE refund_request_id = ?`,
            [rr.refund_request_id]
        );
        const totalRefunded = Number(totalRows[0].totalRefunded);
        const newStatus = stillRemainingDuration <= 0.01 ? 'RESOLD_FULL_REFUND' : 'PARTIALLY_RESOLD';
        const refundTxnId = `RFND-${Date.now()}-${crypto.randomUUID().split('-')[0]}`;

        await connection.query(`
            UPDATE RefundRequest
            SET status = ?, refunded_amount = ?, refund_transaction_id = ?
            WHERE refund_request_id = ?
        `, [newStatus, totalRefunded, refundTxnId, rr.refund_request_id]);
    }
}

// Settle expired refund requests when journey date passes
async function finalizeExpiredRefunds(connection, username) {
    const [candidates] = await connection.query(`
        SELECT rr.refund_request_id, rr.status, rr.potential_partial_refund, rr.refunded_amount,
               b.train_id, b.start_station_id AS orig_start, b.end_station_id AS orig_end
        FROM RefundRequest rr
                 JOIN Ticket t ON rr.ticket_id = t.ticket_id
                 JOIN Booking b ON t.booking_id = b.booking_id
        WHERE rr.original_user_id = ?
          AND rr.status IN ('PENDING_RESALE', 'PARTIALLY_RESOLD')
          AND t.journey_date < CURDATE()
    `, [username]);

    for (const rr of candidates) {
        let finalRefund;

        if (rr.status === 'PENDING_RESALE') {
            finalRefund = Number(rr.potential_partial_refund);
        } else {
            const schedule = await getCumulativeSchedule(connection, rr.train_id);
            const originalInterval = schedule ? buildInterval(schedule, rr.orig_start, rr.orig_end) : null;

            if (!originalInterval) {
                finalRefund = Number(rr.refunded_amount);
            } else {
                const originalDuration = originalInterval.e - originalInterval.s;
                const [existingResales] = await connection.query(
                    `SELECT start_station_id, end_station_id FROM ResaleSegment WHERE refund_request_id = ?`,
                    [rr.refund_request_id]
                );
                let remaining = [originalInterval];
                for (const seg of existingResales) {
                    const iv = buildInterval(schedule, seg.start_station_id, seg.end_station_id);
                    if (iv) remaining = subtractInterval(remaining, iv);
                }
                const remainingDuration = remaining.reduce((sum, iv) => sum + (iv.e - iv.s), 0);
                const remainingFraction = originalDuration > 0 ? Math.max(0, remainingDuration / originalDuration) : 0;
                finalRefund = Number(rr.refunded_amount) + Number(rr.potential_partial_refund) * remainingFraction;
            }
        }

        const refundTxnId = `RFND-${Date.now()}-${crypto.randomUUID().split('-')[0]}`;
        await connection.query(`
            UPDATE RefundRequest
            SET status = 'EXPIRED_PARTIAL_REFUND', refunded_amount = ?, refund_transaction_id = ?
            WHERE refund_request_id = ?
        `, [Math.round(finalRefund * 100) / 100, refundTxnId, rr.refund_request_id]);
    }
}

async function cleanupExpiredLocks(connection) {
    await connection.query(`
        DELETE FROM Booking
        WHERE status = 'PENDING'
          AND booking_time < DATE_SUB(NOW(), INTERVAL 4 MINUTE)
    `);
}

async function validateActiveSeatLimit(connection, userId, trainId, startStationId, endStationId, journeyDate, requestedSeatCount) {
    const [newJourneyTimes] = await connection.query(`
        SELECT s1.departure_time, s2.arrival_time
        FROM Stoppage s1
                 JOIN Stoppage s2 ON s1.train_id = s2.train_id
        WHERE s1.train_id = ? AND s1.station_id = ? AND s2.station_id = ? AND s1.stoppage_id < s2.stoppage_id
    `, [trainId, startStationId, endStationId]);

    if (newJourneyTimes.length === 0) {
        throw new Error("Invalid route or stoppage not found.");
    }

    const newDepTimeStr = newJourneyTimes[0].departure_time;
    const newArrTimeStr = newJourneyTimes[0].arrival_time;

    let journeyDateFormatted = journeyDate;
    if (journeyDate instanceof Date) {
        const y = journeyDate.getFullYear();
        const m = String(journeyDate.getMonth() + 1).padStart(2, '0');
        const d = String(journeyDate.getDate()).padStart(2, '0');
        journeyDateFormatted = `${y}-${m}-${d}`;
    } else {
        journeyDateFormatted = String(journeyDate).split('T')[0];
    }

    const newDepDateTime = new Date(`${journeyDateFormatted}T${newDepTimeStr}`);
    let newArrDateTime = new Date(`${journeyDateFormatted}T${newArrTimeStr}`);

    if (newArrDateTime <= newDepDateTime) {
        newArrDateTime.setDate(newArrDateTime.getDate() + 1);
    }

    const [activeBookings] = await connection.query(`
        SELECT
            b.booking_id, b.journey_date, b.train_id,
            t.status AS ticket_status,
            s1.departure_time, s2.arrival_time
        FROM Booking b
                 LEFT JOIN Ticket t ON b.booking_id = t.booking_id
                 JOIN Stoppage s1 ON b.train_id = s1.train_id AND b.start_station_id = s1.station_id
                 JOIN Stoppage s2 ON b.train_id = s2.train_id AND b.end_station_id = s2.station_id
        WHERE b.user_id = ?
          AND s1.stoppage_id < s2.stoppage_id
          AND (
            (b.status = 'CONFIRMED' AND (t.status IS NULL OR t.status = 'ACTIVE'))
                OR (b.status = 'PENDING' AND b.booking_time > DATE_SUB(NOW(), INTERVAL 4 MINUTE))
            )
    `, [userId]);

    let overlappingActiveCount = 0;
    const now = new Date();

    for (const bk of activeBookings) {
        let bkDateStr = bk.journey_date;
        if (bk.journey_date instanceof Date) {
            const y = bk.journey_date.getFullYear();
            const m = String(bk.journey_date.getMonth() + 1).padStart(2, '0');
            const d = String(bk.journey_date.getDate()).padStart(2, '0');
            bkDateStr = `${y}-${m}-${d}`;
        } else {
            bkDateStr = String(bk.journey_date).split('T')[0];
        }

        const bkDepDateTime = new Date(`${bkDateStr}T${bk.departure_time}`);
        let bkArrDateTime = new Date(`${bkDateStr}T${bk.arrival_time}`);
        if (bkArrDateTime <= bkDepDateTime) {
            bkArrDateTime.setDate(bkArrDateTime.getDate() + 1);
        }

        if (bkArrDateTime > now) {
            const isOverlapping = (bkDepDateTime < newArrDateTime && bkArrDateTime > newDepDateTime);
            if (isOverlapping) {
                overlappingActiveCount++;
            }
        }
    }

    if (overlappingActiveCount + requestedSeatCount > 4) {
        throw new Error("You already have 4 active seats for an ongoing journey. You cannot book another overlapping journey until your previous trip ends or some seats are cancelled.");
    }
}

// ==========================================
// 🚀 API ROUTE: SIGNUP
// ==========================================
app.post('/api/signup', async (req, res) => {
    const { studentId, mobile, password, fullName } = req.body;

    if (!studentId || studentId.length !== 7 || !/^\d{7}$/.test(studentId)) {
        return res.status(400).json({ message: "Student ID must be exactly 7 digits." });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const studentEmail = `u${studentId}@student.cuet.ac.bd`;

    try {
        const [existingUsers] = await pool.query(
            'SELECT user_id FROM User WHERE username = ? OR email = ?',
            [studentId, studentEmail]
        );
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: "An account with this Student ID or Email already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const verificationToken = jwt.sign(
            { studentId, fullName, email: studentEmail, mobile, passwordHash: hashedPassword, type: 'REGISTRATION_VERIFY' },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        console.log(`\n⏳ Generated 15-minute verification token for Student ID: ${studentId}`);
        const verificationLink = `https://ticketbd.onrender.com/?verify=${verificationToken}`;
        console.log(`👉 ${verificationLink}\n`);

        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: 'TicketBD', email: process.env.EMAIL_USER },
                    to: [{ email: studentEmail }],
                    subject: 'TicketBD - Verify Your CUET Student Account',
                    htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                      <h2 style="color: #0b6e4f;">Welcome to TicketBD 🇧🇩</h2>
                      <p>Hello ${fullName || 'CUETian'},</p>
                      <p>You recently initiated account creation for Student ID: <strong>${studentId}</strong>.</p>
                      <p>Please click the button below within 15 minutes to verify your email and complete your account creation:</p>
                      <a href="${verificationLink}"
                         style="display: inline-block; padding: 12px 24px; background-color: #0b6e4f; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 15px;">
                        VERIFY & CREATE MY ACCOUNT
                      </a>
                    </div>
                  `
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.log("⚠️ Brevo email API error:", data);
                return res.status(200).json({ message: `Verification email sent! Check your email or verification link.` });
            }
            res.status(200).json({ message: `Verification email sent to ${studentEmail}. Link expires in 15 minutes.` });
        } catch (emailError) {
            console.log("⚠️ Email request failed:", emailError);
            res.status(200).json({ message: `Verification email sent! Check your verification link.` });
        }
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: "Server error during signup." });
    }
});

// ==========================================
// 🔗 API ROUTE: VERIFY EMAIL & CREATE USER ACCOUNT
// ==========================================
app.post('/api/verify', async (req, res) => {
    const { token, studentId } = req.body;
    const jwtToken = token || studentId;

    if (!jwtToken) {
        return res.status(400).json({ success: false, message: "Verification token is missing." });
    }

    try {
        let decoded;
        try {
            decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
        } catch (jwtErr) {
            return res.status(400).json({
                success: false,
                message: "Verification link has expired or is invalid. Please sign up again."
            });
        }

        if (decoded.type !== 'REGISTRATION_VERIFY') {
            return res.status(400).json({ success: false, message: "Invalid verification token." });
        }

        const { studentId: regStudentId, email: regEmail, mobile: regMobile, passwordHash } = decoded;

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const insertQuery = `
                INSERT INTO User (user_id, username, password, email, phone_number, is_verified, role)
                VALUES (?, ?, ?, ?, ?, TRUE, 'passenger')
            `;
            await connection.query(insertQuery, [regStudentId, regStudentId, passwordHash, regEmail, regMobile]);

            await connection.commit();
            res.status(200).json({
                success: true,
                message: "Account successfully created and verified! You can now log in."
            });
        } catch (dbErr) {
            await connection.rollback();
            if (dbErr.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: "Account has already been verified and created. You can log in." });
            }
            res.status(500).json({ success: false, message: "Database error during account creation." });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Verification Error:", error);
        res.status(500).json({ success: false, message: "Failed to verify account." });
    }
});

// ==========================================
// 🔐 API ROUTE: LOGIN
// ==========================================
app.post('/api/login', async (req, res) => {
    const { studentId, password } = req.body;

    try {
        const query = `SELECT * FROM User WHERE username = ?`;
        const [users] = await pool.query(query, [studentId]);

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid Student ID or password." });
        }

        const user = users[0];

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Invalid Student ID or password." });
        }

        const token = issueToken(user);

        res.status(200).json({
            success: true,
            message: "Login successful!",
            token,
            user: { id: user.user_id, studentId: user.username, role: user.role }
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server error during login." });
    }
});

// ==========================================
// 👤 API ROUTE: GET USER PROFILE
// ==========================================
app.get('/api/user/:userId', authenticateToken, authorizeSelfParam, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT user_id, username, email, phone_number FROM User WHERE user_id = ?',
            [req.params.userId]
        );
        if (users.length > 0) {
            res.json({ success: true, user: users[0] });
        } else {
            res.json({ success: false, message: "User not found" });
        }
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ success: false, message: "Database error" });
    }
});

// ==========================================
// 👤 API ROUTE: UPDATE USER PROFILE
// ==========================================
app.put('/api/user/:userId', authenticateToken, authorizeSelfParam, async (req, res) => {
    const { email, phone_number, password } = req.body;
    try {
        if (password && password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE User SET email=?, phone_number=?, password=? WHERE user_id=?',
                [email, phone_number, hashedPassword, req.params.userId]
            );
        } else {
            await pool.query(
                'UPDATE User SET email=?, phone_number=? WHERE user_id=?',
                [email, phone_number, req.params.userId]
            );
        }
        res.json({ success: true, message: "Profile updated successfully!" });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ success: false, message: "Failed to update profile" });
    }
});

// ==========================================
// 🚂 API ROUTE: FETCH STATIONS (public)
// ==========================================
app.get('/api/stations', async (req, res) => {
    const query = 'SELECT station_id AS id, station_name AS name FROM Station';
    try {
        const [results] = await pool.query(query);
        res.json(results);
    } catch (err) {
        console.error("Error fetching stations:", err);
        return res.status(500).json({ error: "Database error fetching stations" });
    }
});

// ==========================================
// 🚂 API ROUTE: FIND AVAILABLE TRAINS
// ==========================================
app.get('/api/trains', async (req, res) => {
    const { fromStation, toStation, journeyDate } = req.query;

    if (!fromStation || !toStation) {
        return res.status(400).json({ error: "fromStation and toStation are required." });
    }

    try {
        // Find trains where fromStation is BEFORE toStation along the route (s1.stoppage_id < s2.stoppage_id)
        const trainQuery = `
            SELECT t.train_id, t.train_name, t.train_number, t.direction,
                   s1.departure_time AS start_time, s2.arrival_time AS end_time
            FROM Train t
                     JOIN Stoppage s1 ON t.train_id = s1.train_id
                     JOIN Stoppage s2 ON t.train_id = s2.train_id
            WHERE s1.station_id = ?
              AND s2.station_id = ?
              AND s1.stoppage_id < s2.stoppage_id;
        `;
        const [trains] = await pool.query(trainQuery, [fromStation, toStation]);

        for (const train of trains) {
            const [fares] = await pool.query(
                `SELECT class, MIN(price) AS price FROM Seat WHERE train_id = ? GROUP BY class`,
                [train.train_id]
            );

            const fraction = await getSegmentFraction(pool, train.train_id, fromStation, toStation);

            const fareMap = {};
            fares.forEach(f => {
                if (fraction === null) return;
                fareMap[f.class] = Math.round(Number(f.price) * fraction * 100) / 100;
            });
            train.fares = fareMap;

            if (journeyDate) {
                const [allSeats] = await pool.query(
                    `SELECT seat_id, class FROM Seat WHERE train_id = ?`,
                    [train.train_id]
                );
                const overlapStatus = await getOverlapStatusForTrain(pool, train.train_id, journeyDate, fromStation, toStation);

                const availMap = {};
                allSeats.forEach(s => {
                    if (!(s.class in availMap)) availMap[s.class] = 0;
                    const status = overlapStatus.get(Number(s.seat_id));
                    const isTaken = !!(status && (status.booked || status.pending));
                    if (!isTaken) availMap[s.class] += 1;
                });
                train.classAvailability = availMap;
            }
        }

        res.json(trains);
    } catch (err) {
        console.error("🛑 Database Error in /api/trains:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 📊 API ROUTE: DYNAMIC COACH SUMMARY
// ==========================================
app.get('/api/coach-summary', async (req, res) => {
    const { trainId, journeyDate, startStationId, endStationId } = req.query;

    if (!trainId || !journeyDate) {
        return res.status(400).json({ success: false, message: "trainId and journeyDate are required." });
    }

    try {
        const connection = await pool.getConnection();
        await cleanupExpiredLocks(connection);

        const [seatRows] = await connection.query(
            `SELECT seat_id, coach_name, class FROM Seat WHERE train_id = ?`,
            [trainId]
        );

        const overlapStatus = await getOverlapStatusForTrain(connection, trainId, journeyDate, startStationId, endStationId);
        connection.release();

        const summary = {};
        seatRows.forEach(s => {
            const status = overlapStatus.get(Number(s.seat_id));
            const isBooked = !!(status && (status.booked || status.pending));

            if (!summary[s.class]) summary[s.class] = {};
            if (!summary[s.class][s.coach_name]) summary[s.class][s.coach_name] = { total: 0, booked: 0, available: 0 };

            const bucket = summary[s.class][s.coach_name];
            bucket.total += 1;
            if (isBooked) bucket.booked += 1;
        });
        Object.values(summary).forEach(coaches => {
            Object.values(coaches).forEach(bucket => {
                bucket.available = Math.max(0, bucket.total - bucket.booked);
            });
        });

        res.json({ success: true, summary });
    } catch (error) {
        console.error("Error fetching coach summary:", error);
        res.status(500).json({ success: false, message: "Failed to fetch coach summary" });
    }
});

// ==========================================
// 💺 API ROUTE: FETCH COACH SEATS & AVAILABILITY
// ==========================================
app.get('/api/seats', async (req, res) => {
    const { trainId, coachName, journeyDate, class: seatClass, startStationId, endStationId } = req.query;

    try {
        const connection = await pool.getConnection();
        await cleanupExpiredLocks(connection);

        const query = `
            SELECT s.seat_id, s.coach_name, s.seat_number, s.class, s.price
            FROM Seat s
            WHERE s.train_id = ?
              AND s.coach_name = ?
              ${seatClass ? 'AND s.class = ?' : ''}
        `;
        const params = [trainId, coachName];
        if (seatClass) params.push(seatClass);

        const [seatRows] = await connection.query(query, params);

        const overlapStatus = await getOverlapStatusForTrain(connection, trainId, journeyDate, startStationId, endStationId);
        connection.release();

        const seats = seatRows.map(s => {
            const status = overlapStatus.get(Number(s.seat_id));
            return {
                ...s,
                is_booked: status && status.booked ? 1 : 0,
                is_pending: status && status.pending ? 1 : 0,
            };
        });

        res.json({ success: true, seats });
    } catch (error) {
        console.error("Error fetching seats:", error);
        res.status(500).json({ success: false, message: "Failed to fetch seats" });
    }
});

// ==========================================
// 🔒 API ROUTE: LOCK SEATS FOR 4 MINUTES
// ==========================================
app.post('/api/lock-seats', authenticateToken, authorizeSelfBody('userId'), async (req, res) => {
    const { userId, trainId, startStationId, endStationId, journeyDate, selectedSeats } = req.body;

    if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
        return res.status(400).json({ success: false, message: "No seats selected." });
    }

    if (selectedSeats.length > 4) {
        return res.status(400).json({ success: false, message: "You can book at most 4 seats per booking." });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await cleanupExpiredLocks(connection);

        await validateActiveSeatLimit(
            connection, userId, trainId, startStationId, endStationId, journeyDate, selectedSeats.length
        );

        const overlapStatus = await getOverlapStatusForTrain(connection, trainId, journeyDate, startStationId, endStationId);

        const lockedBookingIds = [];

        for (const requestedSeat of selectedSeats) {
            const [seatRows] = await connection.query(
                `SELECT seat_id, price FROM Seat WHERE seat_id = ? FOR UPDATE`,
                [requestedSeat.seat_id]
            );

            if (seatRows.length === 0) {
                throw new Error(`Seat ID ${requestedSeat.seat_id} does not exist.`);
            }

            const conflict = overlapStatus.get(Number(requestedSeat.seat_id));
            if (conflict && (conflict.booked || conflict.pending)) {
                throw new Error(`Another passenger just reserved or locked seat ID ${requestedSeat.seat_id} for an overlapping part of this route. Please select a different seat.`);
            }

            const [bookingResult] = await connection.query(`
                INSERT INTO Booking (user_id, train_id, start_station_id, end_station_id, seat_id, journey_date, status)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
            `, [userId, trainId, startStationId, endStationId, requestedSeat.seat_id, journeyDate]);

            lockedBookingIds.push(bookingResult.insertId);
        }

        await connection.commit();
        const expiresAt = new Date(Date.now() + 4 * 60 * 1000).toISOString();

        res.json({
            success: true,
            message: "Seats locked for 4 minutes.",
            bookingIds: lockedBookingIds,
            expiresAt
        });
    } catch (error) {
        await connection.rollback();
        console.error("Locking Error:", error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// ==========================================
// 🎟️ API ROUTE: FINALIZE CHECKOUT
// ==========================================
app.post('/api/checkout', authenticateToken, authorizeSelfBody('userId'), async (req, res) => {
    const { userId, bookingIds, paymentMethod } = req.body;

    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return res.status(400).json({ success: false, message: "No bookings provided." });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const generatedTickets = [];
        const pnr = `TXN-${Date.now()}-${crypto.randomUUID().split('-')[0]}`;

        for (const bookingId of bookingIds) {
            const [bookings] = await connection.query(`
                SELECT b.booking_id, b.train_id, b.seat_id, b.journey_date, b.start_station_id, b.end_station_id, s.price, b.booking_time
                FROM Booking b
                         JOIN Seat s ON b.seat_id = s.seat_id
                WHERE b.booking_id = ? AND b.user_id = ? AND b.status = 'PENDING'
                    FOR UPDATE
            `, [bookingId, userId]);

            if (bookings.length === 0) {
                throw new Error("Lock expired or invalid. Please try selecting your seats again.");
            }

            const booking = bookings[0];

            const expiryTime = new Date(booking.booking_time).getTime() + 4 * 60 * 1000;
            if (expiryTime < Date.now()) {
                throw new Error("Your 4-minute window to complete the payment has expired.");
            }

            const finalPrice = await calculateSegmentFare(
                connection, booking.train_id, booking.start_station_id, booking.end_station_id, booking.price
            );
            if (finalPrice === null) {
                throw new Error("Could not determine the fare for this journey segment. Please try selecting your seats again.");
            }

            const [ticketResult] = await connection.query(`
                INSERT INTO Ticket (booking_id, user_id, journey_date, price_paid, status)
                VALUES (?, ?, ?, ?, 'ACTIVE')
            `, [booking.booking_id, userId, booking.journey_date, finalPrice]);
            const newTicketId = ticketResult.insertId;

            const paymentTransactionId = `${pnr}_${newTicketId}`;
            await connection.query(`
                INSERT INTO Payment (transaction_id, ticket_id, amount, payment_method)
                VALUES (?, ?, ?, ?)
            `, [paymentTransactionId, newTicketId, finalPrice, paymentMethod || 'bKash']);

            await connection.query(`
                UPDATE Booking SET status = 'CONFIRMED' WHERE booking_id = ?
            `, [booking.booking_id]);

            await processResaleOverlaps(connection, {
                trainId: booking.train_id,
                journeyDate: booking.journey_date,
                seatId: booking.seat_id,
                startStationId: booking.start_station_id,
                endStationId: booking.end_station_id,
                newUserId: userId
            });

            generatedTickets.push(newTicketId);
        }

        await connection.commit();
        res.json({ success: true, message: "Payment successful! Your tickets have been confirmed.", ticketIds: generatedTickets, pnr });
    } catch (error) {
        await connection.rollback();
        console.error("🛑 Checkout Error:", error);
        res.status(400).json({ success: false, message: error.message || "Checkout failed" });
    } finally {
        connection.release();
    }
});

// ==========================================
// 🎟️ API ROUTE: FETCH USER TICKETS
// ==========================================
app.get('/api/my-tickets/:userId', authenticateToken, authorizeSelfParam, async (req, res) => {
    const { userId } = req.params;
    const connection = await pool.getConnection();

    try {
        await finalizeExpiredRefunds(connection, userId);

        const query = `
            SELECT
                t.ticket_id,
                DATE_FORMAT(t.journey_date, '%Y-%m-%d') as journey_date,
                t.price_paid,
                t.status AS ticket_status,
                tr.train_name,
                tr.train_number,
                s.seat_number,
                s.coach_name,
                s.class,
                p.transaction_id,
                SUBSTRING_INDEX(p.transaction_id, '_', 1) AS pnr,
                p.payment_time AS payment_date,
                b.booking_time,
                (SELECT station_name FROM Station WHERE station_id = b.start_station_id) AS start_station,
                (SELECT station_name FROM Station WHERE station_id = b.end_station_id) AS end_station,
                u.email AS user_email,
                u.phone_number AS user_phone,
                rr.status AS refund_status,
                rr.potential_partial_refund,
                rr.refunded_amount
            FROM Ticket t
                     JOIN Booking b ON t.booking_id = b.booking_id
                     JOIN Train tr ON b.train_id = tr.train_id
                     JOIN Seat s ON b.seat_id = s.seat_id
                     JOIN Payment p ON t.ticket_id = p.ticket_id
                     JOIN User u ON t.user_id = u.user_id
                     LEFT JOIN RefundRequest rr ON t.ticket_id = rr.ticket_id
            WHERE t.user_id = ? AND t.journey_date >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
            ORDER BY p.payment_time DESC, t.issue_time DESC, t.ticket_id DESC
        `;
        const [tickets] = await connection.query(query, [userId]);
        res.json({ success: true, tickets });
    } catch (error) {
        console.error("Error fetching tickets:", error);
        res.status(500).json({ success: false, message: "Failed to fetch tickets" });
    } finally {
        connection.release();
    }
});

// ==========================================
// 🚫 API ROUTE: CANCELLATION & SERVICE FEE
// ==========================================
app.post('/api/cancel-ticket', authenticateToken, authorizeSelfBody('studentId'), async (req, res) => {
    const { ticketId, ticketIds, studentId } = req.body;

    let targetTicketIds = [];
    if (Array.isArray(ticketIds) && ticketIds.length > 0) {
        targetTicketIds = ticketIds;
    } else if (ticketId) {
        targetTicketIds = [ticketId];
    } else {
        return res.status(400).json({ success: false, message: "No ticket IDs provided for cancellation." });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        let totalOriginalFare = 0;
        let totalServiceFee = 0;
        let totalEstimatedRefund = 0;
        let cancelledCount = 0;

        for (const tId of targetTicketIds) {
            const [ticketInfo] = await connection.query(
                `SELECT t.ticket_id, t.price_paid, t.journey_date, b.booking_id, b.train_id, b.start_station_id, s.seat_number, s.coach_name
                 FROM Ticket t
                          JOIN Booking b ON t.booking_id = b.booking_id
                          JOIN Seat s ON b.seat_id = s.seat_id
                 WHERE t.ticket_id = ? AND t.user_id = ? AND t.status = 'ACTIVE' FOR UPDATE`,
                [tId, studentId]
            );

            if (ticketInfo.length === 0) {
                continue;
            }
            const ticket = ticketInfo[0];

            const [stoppage] = await connection.query(
                'SELECT departure_time FROM Stoppage WHERE train_id = ? AND station_id = ?',
                [ticket.train_id, ticket.start_station_id]
            );
            const depTime = stoppage.length > 0 && stoppage[0].departure_time ? stoppage[0].departure_time : '06:00:00';

            let formattedDate;
            if (ticket.journey_date instanceof Date) {
                const y = ticket.journey_date.getFullYear();
                const m = String(ticket.journey_date.getMonth() + 1).padStart(2, '0');
                const d = String(ticket.journey_date.getDate()).padStart(2, '0');
                formattedDate = `${y}-${m}-${d}`;
            } else {
                formattedDate = String(ticket.journey_date).split('T')[0];
            }

            const journeyDateTime = new Date(`${formattedDate}T${depTime}`).getTime();
            const currentTime = Date.now();
            const hoursLeft = (journeyDateTime - currentTime) / (1000 * 60 * 60);

            if (hoursLeft <= 0) {
                throw new Error(`Cannot cancel seat ${ticket.coach_name}-${ticket.seat_number}. Train departure time has already passed.`);
            }

            if (hoursLeft < 6) {
                throw new Error(`Cannot cancel seat ${ticket.coach_name}-${ticket.seat_number}. Cancellations are not allowed within 6 hours of departure.`);
            }

            const serviceFee = 20.00;
            const seatFare = parseFloat(ticket.price_paid);
            const baseFareAfterServiceFee = Math.max(0, seatFare - serviceFee);

            let deductionRate = 0.10;
            if (hoursLeft <= 12) {
                deductionRate = 0.75;
            } else if (hoursLeft <= 24) {
                deductionRate = 0.50;
            } else if (hoursLeft <= 48) {
                deductionRate = 0.25;
            }

            const timeDeduction = Math.max(40.00, baseFareAfterServiceFee * deductionRate);
            const potentialRefund = Math.max(0, baseFareAfterServiceFee - timeDeduction);

            totalOriginalFare += seatFare;
            totalServiceFee += serviceFee;
            totalEstimatedRefund += potentialRefund;
            cancelledCount++;

            await connection.query(`UPDATE Ticket SET status = 'CANCELLED' WHERE ticket_id = ?`, [tId]);
            await connection.query(`UPDATE Booking SET status = 'CANCELLED' WHERE booking_id = ?`, [ticket.booking_id]);

            await connection.query(
                `INSERT INTO RefundRequest (ticket_id, original_user_id, time_before_journey_hours, potential_partial_refund, status)
                 VALUES (?, ?, ?, ?, 'PENDING_RESALE')`,
                [tId, studentId, Math.floor(hoursLeft), potentialRefund]
            );
        }

        if (cancelledCount === 0) {
            throw new Error("No active seats were found for cancellation.");
        }

        await connection.commit();
        res.json({
            success: true,
            message: `Successfully cancelled ${cancelledCount} seat(s). Service fee of ৳ ${totalServiceFee.toFixed(2)} deducted (৳ 20/seat). Estimated refund after journey: ৳ ${totalEstimatedRefund.toFixed(2)}.`,
            cancelledCount,
            totalOriginalFare,
            totalServiceFee,
            totalEstimatedRefund
        });
    } catch (error) {
        await connection.rollback();
        console.error("Error cancelling ticket:", error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// ==========================================
// 🔎 API ROUTE: PUBLIC TICKET VERIFICATION (no auth)
// ==========================================
app.get('/api/verify-ticket/:pnr', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                t.status AS ticket_status,
                DATE_FORMAT(t.journey_date, '%Y-%m-%d') AS journey_date,
                tr.train_name, tr.train_number,
                s.coach_name, s.seat_number, s.class,
                (SELECT station_name FROM Station WHERE station_id = b.start_station_id) AS start_station,
                (SELECT station_name FROM Station WHERE station_id = b.end_station_id) AS end_station,
                p.payment_time,
                SUBSTRING_INDEX(p.transaction_id, '_', 1) AS pnr
            FROM Payment p
                     JOIN Ticket t ON p.ticket_id = t.ticket_id
                     JOIN Booking b ON t.booking_id = b.booking_id
                     JOIN Train tr ON b.train_id = tr.train_id
                     JOIN Seat s ON b.seat_id = s.seat_id
            WHERE SUBSTRING_INDEX(p.transaction_id, '_', 1) = ?
            ORDER BY s.coach_name, s.seat_number
        `, [req.params.pnr]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "No ticket found for that PNR." });
        }
        res.json({ success: true, tickets: rows });
    } catch (error) {
        console.error("Error verifying ticket:", error);
        res.status(500).json({ success: false, message: "Failed to verify ticket." });
    }
});

// ==========================================
// 🚀 SERVER STARTUP
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend brain running on port ${PORT} synced with your ER model!`));