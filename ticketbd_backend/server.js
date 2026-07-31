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

// Helper: lazily settle any refund requests whose journey date has passed
async function finalizeExpiredRefunds(connection, username) {
    await connection.query(`
        UPDATE RefundRequest rr
            JOIN Ticket t ON rr.ticket_id = t.ticket_id
        SET rr.status = 'EXPIRED_PARTIAL_REFUND',
            rr.refunded_amount = rr.potential_partial_refund,
            rr.refund_transaction_id = CONCAT('RFND-', UNIX_TIMESTAMP(), '-', SUBSTRING(REPLACE(UUID(), '-', ''), 1, 8))
        WHERE rr.original_user_id = ?
          AND rr.status = 'PENDING_RESALE'
          AND t.journey_date < CURDATE()
    `, [username]);
}

// ==========================================
// 🚀 API ROUTE: SIGNUP & SEND VERIFICATION EMAIL (BREVO HTTP API)
// ==========================================
app.post('/api/signup', async (req, res) => {
    const { studentId, mobile, password } = req.body;

    if (!studentId || studentId.length !== 7 || !/^\d{7}$/.test(studentId)) {
        return res.status(400).json({ message: "Student ID must be exactly 7 digits." });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const studentEmail = `u${studentId}@student.cuet.ac.bd`;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const insertQuery = `
            INSERT INTO User (user_id, username, password, email, phone_number, is_verified)
            VALUES (?, ?, ?, ?, ?, FALSE)
        `;
        await pool.query(insertQuery, [studentId, studentId, hashedPassword, studentEmail, mobile]);
        console.log(`\n✅ Saved user ${studentId} to DB!`);

        const verificationLink = `https://ticketbd.onrender.com/?verify=${studentId}`;
        console.log(`=======================================================`);
        console.log(`🔗 DEV MODE VERIFICATION LINK FOR TESTING:`);
        console.log(`👉 ${verificationLink}`);
        console.log(`=======================================================\n`);

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
                      <p>Hello CUETian,</p>
                      <p>You recently created an account with Student ID: <strong>${studentId}</strong>.</p>
                      <p>Please click the button below to verify your student email address and activate your account:</p>
                      <a href="${verificationLink}"
                         style="display: inline-block; padding: 12px 24px; background-color: #0b6e4f; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 15px;">
                        VERIFY MY ACCOUNT
                      </a>
                    </div>
                  `
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.log("⚠️ Brevo email API returned an error:", data);
                return res.status(200).json({ message: `Success! [DEV MODE] Check your server terminal for the verification link.` });
            }

            console.log('✅ Email sent successfully via Brevo:', data);
            res.status(200).json({ message: `Success! Verification email sent to ${studentEmail}.` });

        } catch (emailError) {
            console.log("⚠️ Email network request failed:", emailError);
            res.status(200).json({ message: `Success! [DEV MODE] Check your server terminal for the verification link.` });
        }
    } catch (error) {
        console.error("Signup Error:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: "An account with this Student ID or Email already exists." });
        }
        res.status(500).json({ message: "Database error during signup." });
    }
});

// ==========================================
// 🔗 API ROUTE: VERIFY EMAIL LINK
// ==========================================
app.post('/api/verify', async (req, res) => {
    const { studentId } = req.body;
    try {
        const updateQuery = `UPDATE User SET is_verified = TRUE WHERE username = ?`;
        const [result] = await pool.query(updateQuery, [studentId]);

        if (result.affectedRows === 0) {
            return res.status(400).json({ success: false, message: "User not found." });
        }
        res.status(200).json({ success: true, message: "Account successfully verified! You can now log in." });
    } catch (error) {
        console.error("Verification Error:", error);
        res.status(500).json({ success: false, message: "Failed to verify account." });
    }
});

// ==========================================
// 🔐 API ROUTE: LOGIN (issues a JWT)
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

        if (!user.is_verified) {
            return res.status(403).json({ success: false, message: "Please verify your email before logging in." });
        }

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
// 👤 API ROUTE: GET USER PROFILE (auth required, self only)
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
// 👤 API ROUTE: UPDATE USER PROFILE (auth required, self only)
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
// 🚂 API ROUTE: FIND AVAILABLE TRAINS & FARES (public)
// ==========================================
app.get('/api/trains', async (req, res) => {
    const { fromStation, toStation } = req.query;

    if (!fromStation || !toStation) {
        return res.status(400).json({ error: "fromStation and toStation are required." });
    }

    try {
        const trainQuery = `
            SELECT t.train_id, t.train_name, t.train_number, t.direction,
                   s1.departure_time AS start_time, s2.arrival_time AS end_time
            FROM Train t
                     JOIN Stoppage s1 ON t.train_id = s1.train_id
                     JOIN Stoppage s2 ON t.train_id = s2.train_id
            WHERE s1.station_id = ?
              AND s2.station_id = ?
              AND s1.departure_time < s2.arrival_time;
        `;
        const [trains] = await pool.query(trainQuery, [fromStation, toStation]);

        for (const train of trains) {
            const [fares] = await pool.query(
                `SELECT class, MIN(price) AS price FROM Seat WHERE train_id = ? GROUP BY class`,
                [train.train_id]
            );
            const fareMap = {};
            fares.forEach(f => { fareMap[f.class] = f.price; });
            train.fares = fareMap;
        }

        res.json(trains);
    } catch (err) {
        console.error("🛑 Database Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 💺 API ROUTE: FETCH COACH SEATS & AVAILABILITY (public)
// ==========================================
app.get('/api/seats', async (req, res) => {
    const { trainId, coachName, journeyDate } = req.query;

    try {
        // 👇 FIX: Added the proper locked_until check so expired seats become available again
        const query = `
            SELECT
                s.seat_id,
                s.coach_name,
                s.seat_number,
                s.price,
                CASE WHEN b.seat_id IS NOT NULL THEN 1 ELSE 0 END AS is_booked
            FROM Seat s
                     LEFT JOIN Booking b
                               ON s.seat_id = b.seat_id
                                   AND b.journey_date = ?
                                   AND (b.status = 'CONFIRMED' OR (b.status = 'PENDING' AND b.locked_until > NOW()))
            WHERE s.train_id = ?
              AND s.coach_name = ?
        `;
        const [seats] = await pool.query(query, [journeyDate, trainId, coachName]);
        res.json({ success: true, seats });
    } catch (error) {
        console.error("Error fetching seats:", error);
        res.status(500).json({ success: false, message: "Failed to fetch seats" });
    }
});

// ==========================================
// 🔒 API ROUTE: LOCK SEATS FOR 4 MINUTES (auth required, self only)
// ==========================================
app.post('/api/lock-seats', authenticateToken, authorizeSelfBody('userId'), async (req, res) => {
    const { userId, trainId, startStationId, endStationId, journeyDate, selectedSeats } = req.body;

    if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
        return res.status(400).json({ success: false, message: "No seats selected." });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 🧹 Clean up any expired locks before we check availability
        await connection.query(`
            DELETE FROM Booking 
            WHERE status = 'PENDING' AND locked_until < NOW()
        `);

        // ---------------------------------------------------------
        // 🛑 VALIDATION 1: Maximum 4 seats per train per day
        // ---------------------------------------------------------
        const [existingSeatsOnTrain] = await connection.query(`
            SELECT COUNT(*) as count FROM Booking
            WHERE user_id = ? AND train_id = ? AND journey_date = ? AND status IN ('CONFIRMED', 'PENDING')
        `, [userId, trainId, journeyDate]);

        const alreadyBookedCount = existingSeatsOnTrain[0].count;
        if (alreadyBookedCount + selectedSeats.length > 4) {
            throw new Error(`Maximum 4 seats allowed. You already have ${alreadyBookedCount} seats booked or locked on this journey.`);
        }

        // ---------------------------------------------------------
        // 🛑 VALIDATION 2: The Teleportation / Overlap Block
        // ---------------------------------------------------------
        const [newJourneyTimes] = await connection.query(`
            SELECT s1.departure_time, s2.arrival_time
            FROM Stoppage s1 JOIN Stoppage s2 ON s1.train_id = s2.train_id
            WHERE s1.train_id = ? AND s1.station_id = ? AND s2.station_id = ?
        `, [trainId, startStationId, endStationId]);

        if (newJourneyTimes.length === 0) throw new Error("Invalid route.");
        const newDepTime = newJourneyTimes[0].departure_time;
        const newArrTime = newJourneyTimes[0].arrival_time;

        const [overlappingBookings] = await connection.query(`
            SELECT b.booking_id, t.train_name, s1.departure_time, s2.arrival_time
            FROM Booking b
            JOIN Train t ON b.train_id = t.train_id
            JOIN Stoppage s1 ON b.train_id = s1.train_id AND b.start_station_id = s1.station_id
            JOIN Stoppage s2 ON b.train_id = s2.train_id AND b.end_station_id = s2.station_id
            WHERE b.user_id = ? AND b.journey_date = ? AND b.status IN ('CONFIRMED', 'PENDING')
              AND b.train_id != ? AND (s1.departure_time < ? AND s2.arrival_time > ?)
        `, [userId, journeyDate, trainId, newArrTime, newDepTime]);

        if (overlappingBookings.length > 0) {
            const conflict = overlappingBookings[0];
            throw new Error(`Conflict detected with your journey on ${conflict.train_name}.`);
        }

        // ---------------------------------------------------------
        // 🔒 LOCKING THE SEATS
        // ---------------------------------------------------------
        const lockedBookingIds = [];

        for (const requestedSeat of selectedSeats) {
            // The DBMS FOR UPDATE lock prevents race conditions right here
            const [seatRows] = await connection.query(
                `SELECT seat_id, price FROM Seat WHERE seat_id = ? FOR UPDATE`,
                [requestedSeat.seat_id]
            );

            if (seatRows.length === 0) throw new Error(`Seat ${requestedSeat.seat_id} does not exist.`);

            const [alreadyBooked] = await connection.query(
                `SELECT booking_id FROM Booking WHERE seat_id = ? AND journey_date = ? AND status IN ('CONFIRMED', 'PENDING')`,
                [requestedSeat.seat_id, journeyDate]
            );

            if (alreadyBooked.length > 0) {
                throw new Error(`Another passenger just locked or booked seat ${requestedSeat.seat_id}.`);
            }

            // Insert as PENDING with a 4-minute expiration
            const [bookingResult] = await connection.query(`
                INSERT INTO Booking (user_id, train_id, start_station_id, end_station_id, seat_id, journey_date, status, locked_until)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING', DATE_ADD(NOW(), INTERVAL 4 MINUTE))
            `, [userId, trainId, startStationId, endStationId, requestedSeat.seat_id, journeyDate]);

            lockedBookingIds.push(bookingResult.insertId);
        }

        await connection.commit();
        res.json({ success: true, message: "Seats locked for 4 minutes.", bookingIds: lockedBookingIds });
    } catch (error) {
        await connection.rollback();
        console.error("Locking Error:", error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
});

// ==========================================
// 🎟️ API ROUTE: FINALIZE CHECKOUT (auth required, self only)
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

        for (const bookingId of bookingIds) {
            // Verify the lock still exists and belongs to the user
            const [bookings] = await connection.query(`
                SELECT b.booking_id, b.seat_id, b.journey_date, b.start_station_id, b.end_station_id, s.price, b.locked_until
                FROM Booking b
                JOIN Seat s ON b.seat_id = s.seat_id
                WHERE b.booking_id = ? AND b.user_id = ? AND b.status = 'PENDING'
                FOR UPDATE
            `, [bookingId, userId]);

            if (bookings.length === 0) {
                throw new Error("Lock expired or invalid. Please try selecting your seats again.");
            }

            const booking = bookings[0];

            // Double check if the 4 minutes have passed
            if (new Date(booking.locked_until).getTime() < Date.now()) {
                throw new Error("Your 4-minute window to complete the payment has expired.");
            }

            // Generate Ticket
            const [ticketResult] = await connection.query(`
                INSERT INTO Ticket (booking_id, user_id, journey_date, price_paid, status)
                VALUES (?, ?, ?, ?, 'ACTIVE')
            `, [booking.booking_id, userId, booking.journey_date, booking.price]);
            const newTicketId = ticketResult.insertId;

            // Generate Payment
            const transactionId = `TXN-${Date.now()}-${crypto.randomUUID().split('-')[0]}`;
            await connection.query(`
                INSERT INTO Payment (transaction_id, ticket_id, amount, payment_method)
                VALUES (?, ?, ?, ?)
            `, [transactionId, newTicketId, booking.price, paymentMethod]);

            // Update Booking status to CONFIRMED
            await connection.query(`
                UPDATE Booking SET status = 'CONFIRMED', locked_until = NULL WHERE booking_id = ?
            `, [booking.booking_id]);

            // Check for pending refunds to settle (Resale Logic)
            const [pendingRefund] = await connection.query(`
                SELECT rr.refund_request_id, t.price_paid AS original_price
                FROM RefundRequest rr
                JOIN Ticket t ON rr.ticket_id = t.ticket_id
                JOIN Booking b ON t.booking_id = b.booking_id
                WHERE b.seat_id = ? AND b.journey_date = ? AND rr.status = 'PENDING_RESALE' LIMIT 1
            `, [booking.seat_id, booking.journey_date]);

            if (pendingRefund.length > 0) {
                const refund = pendingRefund[0];
                const refundTxnId = `RFND-${Date.now()}-${crypto.randomUUID().split('-')[0]}`;

                await connection.query(`
                    INSERT INTO ResaleSegment (refund_request_id, new_user_id, start_station_id, end_station_id, allocated_price)
                    VALUES (?, ?, ?, ?, ?)
                `, [refund.refund_request_id, userId, booking.start_station_id, booking.end_station_id, booking.price]);

                await connection.query(`
                    UPDATE RefundRequest
                    SET status = 'RESOLD_FULL_REFUND', refunded_amount = ?, refund_transaction_id = ?
                    WHERE refund_request_id = ?
                `, [refund.original_price, refundTxnId, refund.refund_request_id]);
            }

            generatedTickets.push(newTicketId);
        }

        await connection.commit();
        res.json({ success: true, message: "Tickets generated successfully!", ticketIds: generatedTickets });
    } catch (error) {
        await connection.rollback();
        console.error("🛑 Checkout Error:", error);
        res.status(400).json({ success: false, message: error.message || "Checkout failed" });
    } finally {
        connection.release();
    }
});

// ==========================================
// 🎟️ API ROUTE: FETCH USER TICKETS - 15-DAY HISTORY (auth required, self only)
// ==========================================
app.get('/api/my-tickets/:userId', authenticateToken, authorizeSelfParam, async (req, res) => {
    const { userId } = req.params;
    const connection = await pool.getConnection();

    try {
        await finalizeExpiredRefunds(connection, userId);

        const query = `
            SELECT
                t.ticket_id, DATE_FORMAT(t.journey_date, '%Y-%m-%d') as journey_date, t.price_paid, t.status AS ticket_status,
                tr.train_name, tr.train_number,
                s.seat_number, s.coach_name,
                p.transaction_id, p.payment_time AS payment_date,
                (SELECT station_name FROM Station WHERE station_id = b.start_station_id) AS start_station,
                (SELECT station_name FROM Station WHERE station_id = b.end_station_id) AS end_station,
                rr.status AS refund_status,
                rr.potential_partial_refund,
                rr.refunded_amount
            FROM Ticket t
                     JOIN Booking b ON t.booking_id = b.booking_id
                     JOIN Train tr ON b.train_id = tr.train_id
                     JOIN Seat s ON b.seat_id = s.seat_id
                     JOIN Payment p ON t.ticket_id = p.ticket_id
                     LEFT JOIN RefundRequest rr ON t.ticket_id = rr.ticket_id
            WHERE t.user_id = ? AND t.journey_date >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
            ORDER BY t.journey_date DESC, t.issue_time DESC
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
// 🚫 API ROUTE: CANCEL TICKET & CALCULATE REFUND (auth required, self only)
// ==========================================
app.post('/api/cancel-ticket', authenticateToken, authorizeSelfBody('studentId'), async (req, res) => {
    const { ticketId, studentId } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [ticketInfo] = await connection.query(
            `SELECT t.price_paid, t.journey_date, b.booking_id, b.train_id, b.start_station_id
             FROM Ticket t
                      JOIN Booking b ON t.booking_id = b.booking_id
             WHERE t.ticket_id = ? AND t.user_id = ? AND t.status = 'ACTIVE'`,
            [ticketId, studentId]
        );

        if (ticketInfo.length === 0) {
            throw new Error("Active ticket not found.");
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

        const journeyDateTime = new Date(`${formattedDate}T${depTime}+06:00`).getTime();
        const currentTime = new Date().getTime();
        const hoursLeft = (journeyDateTime - currentTime) / (1000 * 60 * 60);

        if (hoursLeft <= 0) {
            throw new Error("Cannot cancel ticket. The train has already departed or the journey date/time has passed.");
        }

        if (hoursLeft < 6) {
            throw new Error("Tickets cannot be cancelled less than 6 hours before departure.");
        }

        const serviceCharge = 20.00;
        const baseFare = parseFloat(ticket.price_paid) - serviceCharge;
        let deduction;

        if (hoursLeft > 48) {
            deduction = Math.max(40, baseFare * 0.10);
        } else if (hoursLeft > 24) {
            deduction = Math.max(40, baseFare * 0.25);
        } else if (hoursLeft > 12) {
            deduction = Math.max(40, baseFare * 0.50);
        } else {
            deduction = Math.max(40, baseFare * 0.75);
        }

        const potentialRefund = Math.max(0, baseFare - deduction);

        await connection.query(`UPDATE Ticket SET status = 'CANCELLED' WHERE ticket_id = ?`, [ticketId]);
        await connection.query(`UPDATE Booking SET status = 'CANCELLED' WHERE booking_id = ?`, [ticket.booking_id]);

        await connection.query(
            `INSERT INTO RefundRequest (ticket_id, original_user_id, time_before_journey_hours, potential_partial_refund, status)
             VALUES (?, ?, ?, ?, 'PENDING_RESALE')`,
            [ticketId, studentId, Math.floor(hoursLeft), potentialRefund]
        );

        await connection.commit();
        res.json({
            success: true,
            message: `Ticket cancelled. If your seat is bought by another passenger, you'll get a full refund. Otherwise, your estimated refund after the journey date is ৳${potentialRefund.toFixed(2)}.`
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
app.get('/api/verify-ticket/:transactionId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                t.status AS ticket_status,
                DATE_FORMAT(t.journey_date, '%Y-%m-%d') AS journey_date,
                tr.train_name, tr.train_number,
                s.coach_name, s.seat_number, s.class,
                (SELECT station_name FROM Station WHERE station_id = b.start_station_id) AS start_station,
                (SELECT station_name FROM Station WHERE station_id = b.end_station_id) AS end_station,
                p.payment_time
            FROM Payment p
                     JOIN Ticket t ON p.ticket_id = t.ticket_id
                     JOIN Booking b ON t.booking_id = b.booking_id
                     JOIN Train tr ON b.train_id = tr.train_id
                     JOIN Seat s ON b.seat_id = s.seat_id
            WHERE p.transaction_id = ?
        `, [req.params.transactionId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "No ticket found for that PNR." });
        }
        res.json({ success: true, ticket: rows[0] });
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