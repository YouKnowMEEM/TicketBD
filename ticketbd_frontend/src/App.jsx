import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import './App.css';

const API_BASE = 'https://ticketbd-backend.onrender.com';

// --- EXACT BANGLADESH RAILWAY COACH BLUEPRINTS ---
const COACH_MAPS = {
    'AC_S': [ // 33 seats, 17 rows, 2 aisle columns on left
        [null, null, 3, 2, 1],
        [null, null, 6, 5, 4],
        [null, null, null, null, null],
        [null, null, 9, 8, 7],
        [null, null, 12, 11, 10],
        [null, null, null, null, null],
        [null, null, 15, 14, 13],
        [null, null, null, null, null],
        [null, null, 18, 17, 16],
        [null, null, null, null, null],
        [null, null, 21, 20, 19],
        [null, null, null, null, null],
        [null, null, 24, 23, 22],
        [null, null, 27, 26, 25],
        [null, null, null, null, null],
        [null, null, 28, 29, 30],
        [null, null, 31, 32, 33]
    ],
    'F_SEAT': [
        [null, null, 3, 2, 1],
        [null, null, 6, 5, 4],
        [null, null, null, null, null],
        [null, null, 9, 8, 7],
        [null, null, 12, 11, 10],
        [null, null, null, null, null],
        [null, null, 15, 14, 13],
        [null, null, null, null, null],
        [null, null, 18, 17, 16],
        [null, null, null, null, null],
        [null, null, 21, 20, 19],
        [null, null, null, null, null],
        [null, null, 24, 23, 22],
        [null, null, 27, 26, 25],
        [null, null, null, null, null],
        [null, null, 28, 29, 30],
        [null, null, 31, 32, 33]
    ],
    'SNIGDHA': [ // 55 seats, 16 rows.
        [3, null, null, 2, 1],
        [7, 6, null, 5, 4],
        [11, 10, null, 9, 8],
        [15, 14, null, 13, 12],
        [19, 18, null, 17, 16],
        [23, 22, null, 21, 20],
        [27, 26, null, 25, 24],
        [null, null, null, null, null],
        [31, 30, null, 29, 28],
        [35, 34, null, 33, 32],
        [39, 38, null, 37, 36],
        [43, 42, null, 41, 40],
        [47, 46, null, 45, 44],
        [51, 50, null, 49, 48],
        [54, 53, null, null, 52],
        [null, null, null, null, 55]
    ],
    'S_CHAIR': [ // 60 seats, 18 rows.
        [null, null, null, null, 1],
        [4, 3, null, null, 2],
        [8, 7, null, 6, 5],
        [12, 11, null, 10, 9],
        [16, 15, null, 14, 13],
        [20, 19, null, 18, 17],
        [24, 23, null, 22, 21],
        [28, 27, null, 26, 25],
        [32, 31, null, 30, 29],
        [null, null, null, null, null],
        [36, 35, null, 34, 33],
        [40, 39, null, 38, 37],
        [44, 43, null, 42, 41],
        [48, 47, null, 46, 45],
        [52, 51, null, 50, 49],
        [56, 55, null, 54, 53],
        [59, null, null, 58, 57],
        [60, null, null, null, null]
    ]
};

function Spinner({ dark }) {
    return <span className={`tb-spinner ${dark ? 'dark' : ''}`} />;
}

export function App() {
    const [view, setView] = useState('home');

    // --- Station State ---
    const [stationList, setStationList] = useState([]);
    // --- Auth / Session States ---
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [token, setToken] = useState(null);
    const [authMode, setAuthMode] = useState('login');
    const [studentId, setStudentId] = useState('');
    const [password, setPassword] = useState('');
    const [mobile, setMobile] = useState('');
    const [authMessage, setAuthMessage] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    // --- Search States ---
    const [fromStationName, setFromStationName] = useState('');
    const [toStationName, setToStationName] = useState('');
    const [journeyDate, setJourneyDate] = useState('');
    const [displayDate, setDisplayDate] = useState('');
    const [seatClass, setSeatClass] = useState('');
    const [trains, setTrains] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);

    // --- Seat Layout States ---
    const [expandedTrainId, setExpandedTrainId] = useState(null);
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [selectedCoach, setSelectedCoach] = useState('');
    const [coachSeats, setCoachSeats] = useState([]);
    const [seatsLoading, setSeatsLoading] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);

    // --- My Profile/Tickets States ---
    const [myTickets, setMyTickets] = useState([]);
    const [profileTab, setProfileTab] = useState('tickets');
    const [userProfile, setUserProfile] = useState({ username: '', email: '', phone_number: '', password: '' });
    const [profileMessage, setProfileMessage] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);

    // --- Verify Ticket / Contact modals ---
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [pnrInput, setPnrInput] = useState('');
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifyError, setVerifyError] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);

    const toInputRef = useRef(null);
    const dateInputRef = useRef(null);
    const classInputRef = useRef(null);

    // --- DATE LIMIT CALCULATION (Current to Next 10 Days) ---
    const getMinMaxDates = () => {
        const today = new Date();
        const minDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        const maxDateObj = new Date(today);
        maxDateObj.setDate(maxDateObj.getDate() + 10);
        const maxDate = new Date(maxDateObj.getTime() - (maxDateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        return { minDate, maxDate };
    };
    const { minDate, maxDate } = getMinMaxDates();

    // --- EFFECT 1: VERIFICATION TRAP (email verify link) ---
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const verifyId = searchParams.get('verify');

        if (verifyId) {
            setView('verify_screen');
            fetch(`${API_BASE}/api/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: verifyId })
            })
                .then(res => res.json())
                .then(data => setAuthMessage(data.message))
                .catch(() => setAuthMessage("Verification failed. Server error."));
        }
    }, []);

    // --- EFFECT 2: FETCH STATIONS FROM BACKEND ON LOAD ---
    useEffect(() => {
        // We use API_BASE here instead of localhost!
        fetch(`${API_BASE}/api/stations`)
            .then(res => {
                if (!res.ok) throw new Error('Network response was not ok');
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    setStationList(data);
                }
            })
            .catch(err => console.error("🛑 Failed to load stations:", err));
    }, []);

    // --- EFFECT 3: RESTORE SESSION ON PAGE LOAD ---
    useEffect(() => {
        const savedToken = localStorage.getItem('tb_token');
        const savedId = localStorage.getItem('tb_studentId');
        if (savedToken && savedId) {
            setToken(savedToken);
            setStudentId(savedId);
            setIsLoggedIn(true);
        }
    }, []);

    // --- AUTH-AWARE FETCH HELPER ---
    const authFetch = (url, options = {}) => {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch(url, { ...options, headers });
    };

    // --- HELPER: resolve a station name to its id, strictly from the DB list ---
    const getStationIdByName = (name) => {
        if (!name) return null;
        const match = stationList.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
        return match ? match.id : null;
    };

    // --- SESSION EXPIRY HANDLER ---
    const handleSessionExpired = () => {
        localStorage.removeItem('tb_token');
        localStorage.removeItem('tb_studentId');
        setToken(null);
        setIsLoggedIn(false);
        setStudentId('');
        setView('auth');
        setAuthMode('login');
        setAuthMessage('Your session has expired. Please log in again.');
    };

    // --- LOGOUT ---
    const handleLogout = () => {
        localStorage.removeItem('tb_token');
        localStorage.removeItem('tb_studentId');
        setToken(null);
        setIsLoggedIn(false);
        setStudentId('');
        setMyTickets([]);
        setTrains([]);
        setView('home');
    };

    // --- PDF GENERATION ---
    const generatePDF = (ticket) => {
        const doc = new jsPDF();

        // Colors
        const primaryGreen = [11, 110, 79];
        const darkGray = [60, 60, 60];
        const lightGray = [150, 150, 150];
        const borderColor = [200, 200, 200];

        // ==========================================
        // 1. TOP BANNER HEADER
        // ==========================================
        doc.setFillColor(...primaryGreen);
        doc.rect(0, 0, 210, 25, 'F'); // Full width green rectangle

        doc.setTextColor(255, 255, 255); // White text
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text('BANGLADESH RAILWAY', 105, 12, { align: 'center' });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text('E-TICKET / BOARDING PASS', 105, 18, { align: 'center' });

        // ==========================================
        // 2. PNR & BARCODE AREA
        // ==========================================
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text('PNR NUMBER:', 20, 38);

        doc.setTextColor(...primaryGreen);
        doc.setFontSize(14);
        doc.text(ticket.transaction_id || 'N/A', 50, 38);

        doc.setTextColor(...lightGray);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`Issued: ${new Date(ticket.payment_date).toLocaleString()}`, 190, 38, { align: 'right' });

        // ==========================================
        // 3. JOURNEY DETAILS BOX
        // ==========================================
        doc.setDrawColor(...borderColor);
        doc.setFillColor(252, 252, 252);
        doc.roundedRect(20, 45, 170, 40, 3, 3, 'FD'); // Filled and stroked rounded box

        // Labels
        doc.setFontSize(8);
        doc.setTextColor(...lightGray);
        doc.text('FROM', 25, 52);
        doc.text('TO', 105, 52);
        doc.text('TRAIN', 25, 70);
        doc.text('JOURNEY DATE', 105, 70);

        // Values
        doc.setFontSize(12);
        doc.setTextColor(...darkGray);
        doc.setFont("helvetica", "bold");
        doc.text(ticket.start_station, 25, 58);
        doc.text(ticket.end_station, 105, 58);

        doc.setFontSize(11);
        doc.text(`${ticket.train_name} [${ticket.train_number}]`, 25, 76);
        doc.text(ticket.journey_date, 105, 76);

        // ==========================================
        // 4. PASSENGER & SEAT DETAILS BOX
        // ==========================================
        doc.roundedRect(20, 90, 170, 25, 3, 3, 'FD');

        // Labels
        doc.setFontSize(8);
        doc.setTextColor(...lightGray);
        doc.setFont("helvetica", "normal");
        doc.text('PASSENGER', 25, 97);
        doc.text('COACH', 105, 97);
        doc.text('SEAT / BERTH', 145, 97);

        // Values
        doc.setFontSize(11);
        doc.setTextColor(...darkGray);
        doc.setFont("helvetica", "bold");
        doc.text(`CUET Student (ID: ${studentId})`, 25, 104);
        doc.text(ticket.coach_name || 'N/A', 105, 104);
        doc.setTextColor(...primaryGreen);
        doc.text(ticket.seat_number || 'N/A', 145, 104);

        // ==========================================
        // 5. PAYMENT BREAKDOWN
        // ==========================================
        doc.setTextColor(...darkGray);
        doc.setFontSize(11);
        doc.text('FARE DETAILS', 20, 130);
        doc.line(20, 133, 190, 133); // Underline

        const baseFare = parseFloat(ticket.price_paid || 0);
        const vat = baseFare * 0.15;
        const serviceCharge = 20.00;
        const total = baseFare + vat + serviceCharge;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text('Base Ticket Fare:', 20, 142);
        doc.text(`BDT ${baseFare.toFixed(2)}`, 190, 142, { align: 'right' });

        doc.text('VAT (15%):', 20, 148);
        doc.text(`BDT ${vat.toFixed(2)}`, 190, 148, { align: 'right' });

        doc.text('Service Charge:', 20, 154);
        doc.text(`BDT ${serviceCharge.toFixed(2)}`, 190, 154, { align: 'right' });

        // Total Line
        doc.setDrawColor(...lightGray);
        doc.line(130, 160, 190, 160);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Total Amount Paid:', 130, 166);
        doc.setTextColor(...primaryGreen);
        doc.text(`BDT ${total.toFixed(2)}`, 190, 166, { align: 'right' });

        // ==========================================
        // 6. INSTRUCTIONS & FOOTER
        // ==========================================
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...darkGray);
        doc.text('Important Information:', 20, 190);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...lightGray);
        const instructions = [
            '• Carrying NID or Photo ID (Student ID) while travelling is mandatory.',
            '• You can carry either a soft copy or printed copy of your e-ticket.',
            '• No need to print e-ticket from the counter.'
        ];

        instructions.forEach((inst, index) => {
            doc.text(inst, 20, 196 + (index * 5));
        });

        // Footer greeting
        doc.setTextColor(...primaryGreen);
        doc.setFont("helvetica", "bold");
        doc.text('Wishing you a pleasant and safe journey', 105, 275, { align: 'center' });
        doc.setFont("helvetica", "normal");
        doc.text('Bangladesh Railway', 105, 280, { align: 'center' });

        // Save
        doc.save(`TicketBD_${ticket.transaction_id}.pdf`);
    };

    // --- AUTHENTICATION HANDLERS ---
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setAuthMessage('');

        if (studentId.length !== 7) {
            setAuthMessage('Student ID must be exactly 7 digits.');
            return;
        }

        setAuthLoading(true);
        if (authMode === 'signup') {
            try {
                const response = await fetch(`${API_BASE}/api/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId, mobile, password })
                });
                const data = await response.json();
                setAuthMessage(data.message);
            } catch (err) {
                setAuthMessage("Network error. Is the backend running?");
            }
        } else {
            try {
                const response = await fetch(`${API_BASE}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId, password })
                });
                const data = await response.json();
                if (response.ok && data.success) {
                    localStorage.setItem('tb_token', data.token);
                    localStorage.setItem('tb_studentId', studentId);
                    setToken(data.token);
                    setIsLoggedIn(true);
                    setView('home');
                } else {
                    setAuthMessage(data.message || "Failed to log in.");
                }
            } catch (err) {
                setAuthMessage("Network error. Is the backend running?");
            }
        }
        setAuthLoading(false);
    };

    // --- LOAD TICKETS & PROFILE DATA ---
    const loadProfileData = async () => {
        try {
            setProfileMessage('');
            const userRes = await authFetch(`${API_BASE}/api/user/${studentId}`);
            if (userRes.status === 401 || userRes.status === 403) return handleSessionExpired();
            const userData = await userRes.json();
            if (userData.success) {
                setUserProfile({
                    username: userData.user.username || '',
                    email: userData.user.email || '',
                    phone_number: userData.user.phone_number || '',
                    password: ''
                });
            }

            const ticketRes = await authFetch(`${API_BASE}/api/my-tickets/${studentId}`);
            if (ticketRes.status === 401 || ticketRes.status === 403) return handleSessionExpired();
            const ticketData = await ticketRes.json();
            if (ticketData.success) setMyTickets(ticketData.tickets);

            setView('profile');
        } catch (error) {
            console.error("Failed to load profile data", error);
            alert("Network Error: Could not load profile information.");
        }
    };

    // --- UPDATE PROFILE HANDLER ---
    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setProfileMessage('');
        setProfileSaving(true);
        try {
            const response = await authFetch(`${API_BASE}/api/user/${studentId}`, {
                method: 'PUT',
                body: JSON.stringify(userProfile)
            });
            if (response.status === 401 || response.status === 403) return handleSessionExpired();
            const data = await response.json();
            setProfileMessage(data.message);
            if (data.success) setUserProfile(prev => ({ ...prev, password: '' }));
        } catch (err) {
            setProfileMessage("Network error: Could not update profile.");
        }
        setProfileSaving(false);
    };

    // --- CANCEL TICKET HANDLER ---
    const handleCancelTicket = async (ticketId) => {
        const isConfirmed = window.confirm(
            "Are you sure you want to cancel this ticket?\n\n" +
            "If another passenger books this exact seat, you'll receive a FULL refund. " +
            "Otherwise, a partial refund (based on how close to departure you cancelled) is issued once the journey date passes."
        );
        if (!isConfirmed) return;

        try {
            const response = await authFetch(`${API_BASE}/api/cancel-ticket`, {
                method: 'POST',
                body: JSON.stringify({ ticketId, studentId })
            });
            if (response.status === 401 || response.status === 403) return handleSessionExpired();
            const data = await response.json();
            if (data.success) {
                alert(data.message);
                loadProfileData();
            } else {
                alert("Failed to cancel: " + data.message);
            }
        } catch (error) {
            console.error("Cancellation error:", error);
            alert("A network error occurred while trying to cancel the ticket.");
        }
    };

    // --- SEARCH AND BOOKING HANDLERS ---
    const searchTrains = async (e) => {
        e.preventDefault();
        if (!isLoggedIn) {
            setView('auth');
            return;
        }
        const fromId = getStationIdByName(fromStationName);
        const toId = getStationIdByName(toStationName);
        if (!fromId || !toId) {
            alert("Please select valid station names from the list!");
            return;
        }
        setSearchLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/trains?fromStation=${fromId}&toStation=${toId}`);
            const data = await response.json();
            setTrains(data);
            setExpandedTrainId(null);
            setSelectedSeats([]);
            setView('results');
        } catch (err) {
            console.error("Error fetching trains:", err);
            alert("Could not fetch trains. Is the backend running?");
        }
        setSearchLoading(false);
    };

    // --- DYNAMIC SEAT FETCH API ---
    const fetchCoachSeats = async (targetTrainId, targetCoach, targetDate) => {
        setSeatsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/seats?trainId=${targetTrainId}&coachName=${targetCoach}&journeyDate=${targetDate}`);
            const data = await response.json();
            if (data.success) setCoachSeats(data.seats);
        } catch (err) {
            console.error("Failed to fetch seats", err);
        }
        setSeatsLoading(false);
    };

    const handleSeatSelect = (seatId, seatName, isBooked) => {
        if (isBooked) return;
        setSelectedSeats((prevSelected) => {
            const isAlreadySelected = prevSelected.some(seat => seat.id === seatId);
            if (isAlreadySelected) return prevSelected.filter(seat => seat.id !== seatId);
            return [...prevSelected, { id: seatId, name: seatName }];
        });
    };

    // --- UNIFIED CHECKOUT HANDLER ---
    const handleCheckout = async (trainId) => {
        // 🛑 JSON STRINGIFY LOGS (Will print the actual key-value pairs clearly in Console)
        console.log("1. Selected Seats JSON:", JSON.stringify(selectedSeats, null, 2));

        if (selectedSeats.length === 0) {
            alert("Please select at least one seat.");
            return;
        }

        const fromId = getStationIdByName(fromStationName);
        const toId = getStationIdByName(toStationName);

        // Smart fallback mapping to catch seat_id, id, or seatId
        const mappedBookings = selectedSeats.map(seat => {
            const id = seat.seat_id || seat.id || seat.seatId;
            return { seat_id: id };
        });

        const checkoutPayload = {
            userId: studentId,
            trainId: trainId,
            startStationId: fromId,
            endStationId: toId,
            journeyDate: journeyDate,
            paymentMethod: 'bKash',
            bookings: mappedBookings
        };

        console.log("2. Payload JSON being sent:", JSON.stringify(checkoutPayload, null, 2));

        setCheckoutLoading(true);

        try {
            const response = await authFetch(`${API_BASE}/api/checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(checkoutPayload)
            });

            const data = await response.json();
            console.log("3. Backend Response Message:", data);

            if (response.status === 401 || response.status === 403) {
                return handleSessionExpired();
            }

            if (data.success) {
                alert("Booking confirmed! Your tickets have been generated.");
                setSelectedSeats([]);
                fetchCoachSeats(trainId, selectedCoach, journeyDate);
                setProfileTab('tickets');
                loadProfileData();
            } else {
                alert("Checkout failed: " + (data.message || data.error));
            }
        } catch (error) {
            console.error("Error during checkout:", error);
            alert("A network error occurred.");
        }
        setCheckoutLoading(false);
    };

    // --- VERIFY TICKET (public, no login required) ---
    const handleVerifyTicket = async (e) => {
        e.preventDefault();
        setVerifyError('');
        setVerifyResult(null);
        if (!pnrInput.trim()) return;
        setVerifyLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/verify-ticket/${encodeURIComponent(pnrInput.trim())}`);
            const data = await res.json();
            if (data.success) setVerifyResult(data.ticket);
            else setVerifyError(data.message || 'No ticket found for that PNR.');
        } catch (err) {
            setVerifyError('Network error while verifying. Is the backend running?');
        }
        setVerifyLoading(false);
    };

    const closeVerifyModal = () => {
        setShowVerifyModal(false);
        setPnrInput('');
        setVerifyResult(null);
        setVerifyError('');
    };

    // --- HELPER: CHECK IF TICKET CAN BE CANCELLED ---
    const isCancellable = (journeyDateStr) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today (midnight)

        // Properly parse the "YYYY-MM-DD" string
        const [year, month, day] = journeyDateStr.split('-');
        const journeyDate = new Date(year, month - 1, day);

        return journeyDate >= today;
    };

    // --- Refund status -> badge/label helpers ---
    const refundBadge = (ticket) => {
        if (ticket.ticket_status !== 'CANCELLED') return null;
        switch (ticket.refund_status) {
            case 'RESOLD_FULL_REFUND':
                return { label: 'Full refund issued', cls: 'badge-resolved' };
            case 'EXPIRED_PARTIAL_REFUND':
                return { label: 'Partial refund issued', cls: 'badge-partial' };
            default:
                return { label: 'Refund pending', cls: 'badge-pending' };
        }
    };

    return (
        <div className="app-shell">
            {/* ================= GLOBAL HEADER ================= */}
            <div className="tb-header">
                <h2 className="tb-logo" onClick={() => setView('home')}>🚆 TicketBD</h2>
                <div className="tb-nav">
                    <span className="tb-nav-link" onClick={() => setView('home')}>Home</span>
                    <span className="tb-nav-link" onClick={() => setShowVerifyModal(true)}>Verify Ticket</span>
                    <span className="tb-nav-link" onClick={() => setShowContactModal(true)}>Contact Us</span>
                    {isLoggedIn ? (
                        <>
                            <div className="tb-profile-chip" onClick={loadProfileData}>
                                {studentId}
                            </div>
                            <button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: '13px', background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }} onClick={handleLogout}>
                                Logout
                            </button>
                        </>
                    ) : (
                        <button className="btn btn-amber" style={{ padding: '8px 18px' }} onClick={() => setView('auth')}>LOGIN</button>
                    )}
                </div>
            </div>

            {/* ================= VERIFY TICKET MODAL ================= */}
            {showVerifyModal && (
                <div className="tb-modal-overlay" onClick={closeVerifyModal}>
                    <div className="tb-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="tb-modal-close" onClick={closeVerifyModal}>✕</button>
                        <span className="eyebrow">Public lookup</span>
                        <h2 style={{ margin: '4px 0 6px 0', fontSize: '20px' }}>Verify a ticket</h2>
                        <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '18px' }}>
                            Enter the PNR (transaction ID) printed on the e-ticket. No login needed.
                        </p>
                        <form onSubmit={handleVerifyTicket}>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="e.g. TXN-1234567890-123"
                                value={pnrInput}
                                onChange={(e) => setPnrInput(e.target.value)}
                                style={{ marginBottom: '12px', fontFamily: 'var(--font-mono)' }}
                            />
                            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={verifyLoading}>
                                {verifyLoading ? <Spinner /> : 'VERIFY'}
                            </button>
                        </form>

                        {verifyError && (
                            <div style={{ marginTop: '16px', padding: '10px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: '6px', fontSize: '13px' }}>
                                {verifyError}
                            </div>
                        )}

                        {verifyResult && (
                            <div style={{ marginTop: '18px', borderTop: '1px solid var(--line)', paddingTop: '16px', fontSize: '14px' }}>
                                <div style={{ marginBottom: '10px' }}>
                                    <span className={`badge ${verifyResult.ticket_status === 'ACTIVE' ? 'badge-active' : 'badge-partial'}`}>
                                        {verifyResult.ticket_status}
                                    </span>
                                </div>
                                <p style={{ margin: '4px 0' }}><strong>Train:</strong> {verifyResult.train_name} ({verifyResult.train_number})</p>
                                <p style={{ margin: '4px 0' }}><strong>Journey Date:</strong> {verifyResult.journey_date}</p>
                                <p style={{ margin: '4px 0' }}><strong>Route:</strong> {verifyResult.start_station} → {verifyResult.end_station}</p>
                                <p style={{ margin: '4px 0' }}><strong>Seat:</strong> {verifyResult.coach_name}-{verifyResult.seat_number} ({verifyResult.class})</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ================= CONTACT US MODAL ================= */}
            {showContactModal && (
                <div className="tb-modal-overlay" onClick={() => setShowContactModal(false)}>
                    <div className="tb-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="tb-modal-close" onClick={() => setShowContactModal(false)}>✕</button>
                        <span className="eyebrow">We're here to help</span>
                        <h2 style={{ margin: '4px 0 16px 0', fontSize: '20px' }}>Contact Us</h2>
                        <p style={{ fontSize: '14px', margin: '8px 0' }}>📞 <strong>Helpline:</strong> +8801904647992</p>
                        <p style={{ fontSize: '14px', margin: '8px 0' }}>✉️ <strong>Support Email:</strong> ticketbd.cuet@gmail.com</p>
                        <p style={{ fontSize: '14px', margin: '8px 0' }}>🏢 <strong>S. M. Sabiqun Meem</strong></p>
                        <p style={{ fontSize: '14px', margin: '8px 0' }}>   Dept. of CSE, CUET, Chattogram</p>
                        <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '16px' }}>
                            For booking issues, include your PNR (found on your e-ticket) when you reach out.
                        </p>
                    </div>
                </div>
            )}

            <div style={{ paddingBottom: '50px', flex: 1 }}>
                {/* ================= VERIFICATION SCREEN (email link) ================= */}
                {view === 'verify_screen' && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 80px)' }}>
                        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                            <h2 style={{ color: 'var(--rail-green)' }}>Email Verification</h2>
                            <p style={{ fontWeight: 'bold', margin: '20px 0' }}>{authMessage || 'Verifying your account...'}</p>
                            <button
                                className="btn btn-primary"
                                style={{ padding: '10px 20px' }}
                                onClick={() => {
                                    window.history.replaceState(null, '', window.location.pathname);
                                    setView('auth');
                                    setAuthMode('login');
                                }}>
                                GO TO LOGIN
                            </button>
                        </div>
                    </div>
                )}

                {/* ================= AUTHENTICATION (LOGIN / SIGNUP) ================= */}
                {view === 'auth' && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 80px)' }}>
                        <div className="card" style={{ padding: '40px', width: '100%', maxWidth: '400px' }}>
                            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                                <div style={{
                                    width: '60px', height: '60px', backgroundColor: 'var(--rail-green-light)', borderRadius: '50%',
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold',
                                    color: 'var(--rail-green-dark)', fontSize: '24px', margin: '0 auto 10px auto'
                                }}>🇧🇩</div>
                                <h2 style={{ margin: 0, color: 'var(--rail-green)' }}>TicketBD</h2>
                                <p style={{ color: 'var(--ink-soft)', fontSize: '14px', marginTop: '5px' }}>CUET Student Portal</p>
                            </div>

                            <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '2px solid var(--line)' }}>
                                <button
                                    onClick={() => { setAuthMode('login'); setAuthMessage(''); }}
                                    style={{
                                        flex: 1, padding: '10px', background: 'none', border: 'none',
                                        borderBottom: authMode === 'login' ? '3px solid var(--rail-green)' : 'none',
                                        fontWeight: 'bold', color: authMode === 'login' ? 'var(--rail-green)' : '#777', cursor: 'pointer'
                                    }}>
                                    LOGIN
                                </button>
                                <button
                                    onClick={() => { setAuthMode('signup'); setAuthMessage(''); }}
                                    style={{
                                        flex: 1, padding: '10px', background: 'none', border: 'none',
                                        borderBottom: authMode === 'signup' ? '3px solid var(--rail-green)' : 'none',
                                        fontWeight: 'bold', color: authMode === 'signup' ? 'var(--rail-green)' : '#777', cursor: 'pointer'
                                    }}>
                                    SIGN UP
                                </button>
                            </div>

                            {authMessage && (
                                <div style={{
                                    padding: '10px',
                                    background: authMode === 'signup' ? 'var(--rail-green-light)' : 'var(--red-light)',
                                    color: authMode === 'signup' ? 'var(--rail-green-dark)' : 'var(--red)',
                                    borderRadius: '4px', marginBottom: '20px', fontSize: '13px', textAlign: 'center'
                                }}>
                                    {authMessage}
                                </div>
                            )}

                            <form onSubmit={handleAuthSubmit}>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#333' }}>Student ID</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={7}
                                        placeholder="e.g. 2304079"
                                        value={studentId}
                                        onChange={(e) => setStudentId(e.target.value.replace(/\D/g, '').slice(0, 7))}
                                        required
                                        className="input-field"
                                    />
                                </div>
                                {authMode === 'signup' && (
                                    <>
                                        <div style={{ marginBottom: '15px' }}>
                                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#333' }}>Mobile Number</label>
                                            <input
                                                type="tel"
                                                placeholder="e.g. 01XXXXXXXXX"
                                                value={mobile}
                                                onChange={(e) => setMobile(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
                                                required
                                                className="input-field"
                                            />
                                        </div>
                                        {studentId.length === 7 && (
                                            <div style={{
                                                backgroundColor: 'var(--rail-green-light)', padding: '10px', borderRadius: '4px',
                                                fontSize: '12px', color: 'var(--rail-green-dark)', marginBottom: '15px', borderLeft: '3px solid var(--rail-green)'
                                            }}>
                                                <strong>Verification email will be sent to:</strong><br />u{studentId}@student.cuet.ac.bd
                                            </div>
                                        )}
                                    </>
                                )}
                                <div style={{ marginBottom: '25px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#333' }}>Password</label>
                                    <input type="password" placeholder="Enter Password" value={password}
                                           onChange={(e) => setPassword(e.target.value)} required className="input-field" />
                                </div>
                                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }} disabled={authLoading}>
                                    {authLoading ? <Spinner /> : (authMode === 'login' ? 'LOGIN TO SEARCH' : 'CREATE ACCOUNT')}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ================= PROFILE / MY TICKETS PAGE ================= */}
                {view === 'profile' && (
                    <div style={{ maxWidth: '900px', margin: '40px auto', padding: '0 20px' }}>
                        <div style={{ display: 'flex', gap: '20px', borderBottom: '2px solid var(--line)', marginBottom: '25px' }}>
                            <button
                                onClick={() => setProfileTab('tickets')}
                                style={{
                                    padding: '10px 20px', background: 'none', border: 'none',
                                    borderBottom: profileTab === 'tickets' ? '3px solid var(--rail-green)' : 'none',
                                    fontWeight: 'bold', fontSize: '16px', color: profileTab === 'tickets' ? 'var(--rail-green)' : '#666', cursor: 'pointer'
                                }}>
                                15-Day Ticket History
                            </button>
                            <button
                                onClick={() => setProfileTab('info')}
                                style={{
                                    padding: '10px 20px', background: 'none', border: 'none',
                                    borderBottom: profileTab === 'info' ? '3px solid var(--rail-green)' : 'none',
                                    fontWeight: 'bold', fontSize: '16px', color: profileTab === 'info' ? 'var(--rail-green)' : '#666', cursor: 'pointer'
                                }}>
                                Update Profile
                            </button>
                        </div>

                        {profileTab === 'tickets' && (
                            <div>
                                {myTickets.length === 0 ? (
                                    <div className="empty-state">
                                        <span className="icon">🎫</span>
                                        You have no booked tickets in the last 15 days.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '22px' }}>
                                        {myTickets.map(ticket => {
                                            const badge = refundBadge(ticket);
                                            return (
                                                <div key={ticket.ticket_id} className={`ticket-stub ${ticket.ticket_status === 'CANCELLED' ? 'is-cancelled' : ''}`}>
                                                    <div className="ticket-stub-main">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                                            <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '17px' }}>
                                                                {ticket.train_name} ({ticket.train_number})
                                                            </h3>
                                                            {badge && <span className={`badge ${badge.cls}`}>{badge.label}</span>}
                                                        </div>
                                                        <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}><strong>Journey:</strong> {ticket.journey_date}</p>
                                                        <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}><strong>Route:</strong> {ticket.start_station} to {ticket.end_station}</p>
                                                        <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}><strong>Seat:</strong> {ticket.coach_name}-{ticket.seat_number}</p>
                                                        <p className="pnr" style={{ margin: '8px 0 0 0' }}>PNR: {ticket.transaction_id}</p>

                                                        {ticket.ticket_status === 'CANCELLED' && (
                                                            <div style={{
                                                                margin: '14px 0 0 0', padding: '12px',
                                                                backgroundColor: ticket.refund_status === 'PENDING_RESALE' ? 'var(--amber-light)' : 'var(--rail-green-light)',
                                                                borderRadius: '6px'
                                                            }}>
                                                                {ticket.refund_status === 'PENDING_RESALE' && (
                                                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--amber-dark)', lineHeight: '1.5' }}>
                                                                        ⏳ Waiting to see if this seat is resold.<br />
                                                                        Estimated refund if not resold: <strong>BDT {ticket.potential_partial_refund ? parseFloat(ticket.potential_partial_refund).toFixed(2) : 'TBD'}</strong> (full refund if resold).
                                                                    </p>
                                                                )}
                                                                {ticket.refund_status === 'RESOLD_FULL_REFUND' && (
                                                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--rail-green-dark)', lineHeight: '1.5' }}>
                                                                        ✅ Your seat was resold to another passenger — full refund of <strong>BDT {parseFloat(ticket.refunded_amount).toFixed(2)}</strong> issued.
                                                                    </p>
                                                                )}
                                                                {ticket.refund_status === 'EXPIRED_PARTIAL_REFUND' && (
                                                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--red)', lineHeight: '1.5' }}>
                                                                        The journey date passed without a resale — partial refund of <strong>BDT {parseFloat(ticket.refunded_amount).toFixed(2)}</strong> issued.
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {ticket.ticket_status === 'ACTIVE' && (
                                                        <>
                                                            <div className="ticket-stub-tear" />
                                                            <div className="ticket-stub-side" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                <button className="btn btn-amber" onClick={(e) => { e.stopPropagation(); generatePDF(ticket); }}>
                                                                    DOWNLOAD PDF
                                                                </button>
                                                                {isCancellable(ticket.journey_date) ? (
                                                                    <button className="btn btn-danger" style={{ fontSize: '12px' }} onClick={(e) => { e.stopPropagation(); handleCancelTicket(ticket.ticket_id); }}>
                                                                        CANCEL TICKET
                                                                    </button>
                                                                ) : (
                                                                    <div style={{ textAlign: 'center' }}>
                                                                        <span className="badge badge-partial" style={{ display: 'inline-block', padding: '6px 12px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }}>
                                                                            EXPIRED
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {profileTab === 'info' && (
                            <div className="card" style={{ padding: '30px' }}>
                                <h3 style={{ marginTop: 0, color: '#2c3e50' }}>Personal Information</h3>

                                {profileMessage && (
                                    <div style={{ padding: '10px', background: 'var(--rail-green-light)', color: 'var(--rail-green-dark)', borderRadius: '4px', marginBottom: '20px', fontSize: '14px', textAlign: 'center' }}>
                                        {profileMessage}
                                    </div>
                                )}

                                <form onSubmit={handleProfileUpdate}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Student ID / Username</label>
                                            <input type="text" className="input-field" value={userProfile.username} disabled />
                                            <small style={{ color: '#777' }}>Student ID cannot be changed.</small>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Email Address</label>
                                            <input type="email" className="input-field" value={userProfile.email} onChange={(e) => setUserProfile({ ...userProfile, email: e.target.value })} required />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Phone Number</label>
                                            <input type="text" className="input-field" value={userProfile.phone_number} onChange={(e) => setUserProfile({ ...userProfile, phone_number: e.target.value })} required />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Change Password (Optional)</label>
                                            <input type="password" placeholder="Leave blank to keep current" className="input-field" value={userProfile.password} onChange={(e) => setUserProfile({ ...userProfile, password: e.target.value })} />
                                        </div>
                                    </div>
                                    <button type="submit" className="btn btn-primary" style={{ padding: '12px 24px' }} disabled={profileSaving}>
                                        {profileSaving ? <Spinner /> : 'SAVE CHANGES'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                )}

                {/* ================= HOME PAGE ================= */}
                {view === 'home' && (
                    <div>
                        <div className="card" style={{ maxWidth: '700px', margin: '50px auto', padding: '30px' }}>
                            {!isLoggedIn && (
                                <div style={{
                                    marginBottom: '20px', padding: '12px', backgroundColor: 'var(--amber-light)', color: 'var(--amber-dark)',
                                    borderRadius: '4px', fontSize: '14px', textAlign: 'center'
                                }}>
                                    <strong>Notice:</strong> You must be logged in with a valid CUET Student ID to search and book trains.
                                </div>
                            )}
                            <form onSubmit={searchTrains}>
                                <div style={{ gridTemplateColumns: '1fr 1fr', display: 'grid', gap: '20px', marginBottom: '25px' }}>

                                    {/* 1. FROM STATION DROPDOWN */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>From</label>
                                        <select
                                            value={fromStationName}
                                            onChange={(e) => {
                                                setFromStationName(e.target.value);
                                                if (e.target.value) toInputRef.current?.focus();
                                            }}
                                            required
                                            className="input-field"
                                        >
                                            <option value="" disabled>Select Departure</option>
                                            {stationList.map(station => (
                                                <option key={`from-${station.id}`} value={station.name}>{station.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 2. TO STATION DROPDOWN */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>To</label>
                                        <select
                                            ref={toInputRef}
                                            value={toStationName}
                                            onChange={(e) => {
                                                setToStationName(e.target.value);
                                                if (e.target.value) dateInputRef.current?.focus();
                                            }}
                                            required
                                            className="input-field"
                                        >
                                            <option value="" disabled>Select Destination</option>
                                            {stationList.map(station => (
                                                <option key={`to-${station.id}`} value={station.name}>{station.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 3. CUSTOM DATE INPUT (TYPABLE + CALENDAR ICON) */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>Date of Journey (DD/MM/YYYY)</label>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>

                                            {/* Text input for strict DD/MM/YYYY typing */}
                                            <input
                                                type="text"
                                                ref={dateInputRef}
                                                placeholder="DD/MM/YYYY"
                                                value={displayDate}
                                                maxLength={10}
                                                onChange={(e) => {
                                                    // Auto-format typing to DD/MM/YYYY
                                                    let val = e.target.value.replace(/\D/g, '');
                                                    if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                                                    if (val.length > 5) val = val.slice(0, 5) + '/' + val.slice(5, 9);
                                                    setDisplayDate(val);

                                                    // Update actual backend state when 10 chars are reached
                                                    if (val.length === 10) {
                                                        const [d, m, y] = val.split('/');
                                                        setJourneyDate(`${y}-${m}-${d}`);
                                                        classInputRef.current?.focus();
                                                    } else {
                                                        setJourneyDate('');
                                                    }
                                                }}
                                                required
                                                className="input-field"
                                                style={{ paddingRight: '40px', width: '100%' }}
                                            />

                                            {/* Hidden native date picker activated by clicking the icon area */}
                                            <input
                                                type="date"
                                                min={minDate}
                                                max={maxDate}
                                                onChange={(e) => {
                                                    const selected = e.target.value; // Returns YYYY-MM-DD
                                                    setJourneyDate(selected);
                                                    if (selected) {
                                                        const [y, m, d] = selected.split('-');
                                                        setDisplayDate(`${d}/${m}/${y}`);
                                                        classInputRef.current?.focus();
                                                    }
                                                }}
                                                style={{
                                                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                                    opacity: 0, width: '30px', height: '30px', cursor: 'pointer', zIndex: 2
                                                }}
                                            />

                                            {/* Permanent Calendar Icon */}
                                            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1, fontSize: '18px' }}>
                                                📅
                                            </span>
                                        </div>
                                    </div>

                                    {/* 4. CLASS DROPDOWN */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>Choose Class</label>
                                        <select ref={classInputRef} value={seatClass} onChange={e => setSeatClass(e.target.value)} className="input-field">
                                            <option value="Snigdha">Snigdha</option>
                                            <option value="S_Chair">S_Chair</option>
                                            <option value="AC_B">AC_B</option>
                                        </select>
                                    </div>
                                </div>
                                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }} disabled={searchLoading}>
                                    {searchLoading ? <Spinner /> : 'SEARCH TRAINS'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ================= RESULTS PAGE ================= */}
                {view === 'results' && (
                    <div>
                        <div style={{
                            backgroundColor: '#e9eef3', padding: '12px 40px', display: 'flex',
                            justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #dcdcdc', flexWrap: 'wrap', gap: '10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <span style={{ fontSize: '22px', color: 'var(--rail-green-dark)' }}>🚂</span>
                                <div>
                                    <div style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '16px' }}>{fromStationName} - {toStationName}</div>
                                    <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{journeyDate}</div>
                                </div>
                            </div>
                            <button className="btn btn-amber" style={{ padding: '8px 18px', fontSize: '12px' }} onClick={() => setView('home')}>MODIFY SEARCH</button>
                        </div>

                        <div style={{ maxWidth: '1400px', margin: '25px auto', padding: '0 40px' }}>
                            {Array.isArray(trains) && trains.length > 0 ? (
                                trains.map((train) => {
                                    const trainClasses = {
                                        'SNIGDHA': ['CHA', 'SCHA', 'JA', 'NEO', 'JHA'],
                                        'AC_S': ['GA', 'GHA', 'UMA'],
                                        'S_CHAIR': ['THA', 'DA', 'DHA', 'DANT', 'TO', 'THO', 'TA', 'KA'],
                                        'F_SEAT': ['KHA']
                                    };

                                    const getSeatCount = (coach) => {
                                        if (coach === 'KA') return 15;
                                        if (['GA', 'GHA', 'UMA', 'KHA'].includes(coach)) return 33;
                                        if (['CHA', 'SCHA', 'JA', 'NEO', 'JHA'].includes(coach)) return 55;
                                        return 60;
                                    };

                                    return (
                                        <div key={train.train_id} className="card" style={{ padding: '25px', marginBottom: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', marginBottom: '20px' }}>
                                                <h3 style={{ margin: 0, color: 'var(--amber-dark)', fontSize: '18px', fontWeight: 'bold' }}>{train.train_name.toUpperCase()} ({train.train_number})</h3>
                                            </div>

                                            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '20px' }}>
                                                {Object.keys(trainClasses).map(cls => {
                                                    const isSelectedClass = expandedTrainId === train.train_id && seatClass === cls;
                                                    return (
                                                        <div key={cls} onClick={() => {
                                                            setExpandedTrainId(train.train_id);
                                                            setSeatClass(cls);
                                                            setSelectedSeats([]);
                                                            const firstCoach = trainClasses[cls][0];
                                                            setSelectedCoach(firstCoach);
                                                            fetchCoachSeats(train.train_id, firstCoach, journeyDate);
                                                        }} style={{
                                                            border: isSelectedClass ? '2px solid var(--rail-green)' : '1px solid #cbd5e1',
                                                            borderRadius: '6px', padding: '15px', width: '160px',
                                                            backgroundColor: isSelectedClass ? 'var(--rail-green-light)' : '#fdfdfd',
                                                            cursor: 'pointer', display: 'flex', flexDirection: 'column'
                                                        }}>
                                                            <div style={{ fontWeight: 'bold', color: '#4a5568', fontSize: '14px' }}>{cls}</div>
                                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--rail-green)', margin: '6px 0' }}>
                                                                ৳{(train.fares && train.fares[cls]) ? train.fares[cls] : 'N/A'}
                                                            </div>
                                                            <button className={isSelectedClass ? 'btn btn-primary' : ''} style={{
                                                                marginTop: 'auto', padding: '8px',
                                                                background: isSelectedClass ? undefined : '#e2e8f0',
                                                                color: isSelectedClass ? undefined : '#4a5568',
                                                                border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px'
                                                            }}>
                                                                {isSelectedClass ? 'SELECTED' : 'BOOK NOW'}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {expandedTrainId === train.train_id && seatClass && (
                                                <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '20px', display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                                                    <div style={{ backgroundColor: '#f8fafc', padding: '25px', borderRadius: '12px', border: '1px solid #e2e8f0', width: 'fit-content' }}>

                                                        <div style={{ marginBottom: '20px' }}>
                                                            <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c3e50', display: 'block', marginBottom: '8px' }}>Select Coach</label>
                                                            <select
                                                                className="input-field"
                                                                style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--amber-dark)', borderColor: 'var(--amber)' }}
                                                                value={selectedCoach}
                                                                onChange={(e) => {
                                                                    const newCoach = e.target.value;
                                                                    setSelectedCoach(newCoach);
                                                                    setSelectedSeats([]);
                                                                    fetchCoachSeats(train.train_id, newCoach, journeyDate);
                                                                }}
                                                            >
                                                                {trainClasses[seatClass].map(coach => (
                                                                    <option key={coach} value={coach}>{coach} - {getSeatCount(coach)} Seat(s)</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '25px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                                                                <div className="seat available" style={{ width: '18px', height: '18px', borderRadius: '4px' }}></div>Available
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                                                                <div className="seat selected" style={{ width: '18px', height: '18px', borderRadius: '4px' }}></div>Selected
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                                                                <div className="seat booked" style={{ width: '18px', height: '18px', borderRadius: '4px' }}></div>Booked
                                                            </div>
                                                        </div>

                                                        {seatsLoading ? (
                                                            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Spinner dark /></div>
                                                        ) : (
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                                                                {(() => {
                                                                    const blueprint = COACH_MAPS[seatClass] || COACH_MAPS['S_CHAIR'];
                                                                    return blueprint.map((row, rowIndex) => (
                                                                        row.map((seatNumber, colIndex) => {
                                                                            if (seatNumber === null) {
                                                                                return <div key={`empty-${rowIndex}-${colIndex}`} className="seat empty-space" />;
                                                                            }
                                                                            const dbSeat = coachSeats.find(s => Number(s.seat_number) === seatNumber);
                                                                            if (!dbSeat) {
                                                                                return <div key={`loading-${seatNumber}`} className="seat booked" style={{ opacity: 0.3 }}>{seatNumber}</div>;
                                                                            }
                                                                            const fullSeatName = `${dbSeat.coach_name}-${dbSeat.seat_number}`;
                                                                            const isSelected = selectedSeats.some(s => s.id === dbSeat.seat_id);
                                                                            const isBooked = dbSeat.is_booked === 1 || dbSeat.is_booked === true;
                                                                            return (
                                                                                <div
                                                                                    key={dbSeat.seat_id}
                                                                                    onClick={() => handleSeatSelect(dbSeat.seat_id, fullSeatName, isBooked)}
                                                                                    className={`seat ${isBooked ? 'booked' : isSelected ? 'selected' : 'available'}`}
                                                                                    style={{ width: '100%', height: '40px', fontSize: '12px', padding: '0 10px' }}
                                                                                >
                                                                                    {fullSeatName}
                                                                                </div>
                                                                            );
                                                                        })
                                                                    ));
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="card" style={{ flex: 1, minWidth: '300px', padding: '25px' }}>
                                                        <h3 style={{ margin: '0 0 20px 0', borderBottom: '2px solid #edf2f7', paddingBottom: '10px' }}>Seat Details</h3>

                                                        {selectedSeats.length > 0 && (
                                                            <div style={{ marginBottom: '20px', fontSize: '14px', color: '#4a5568' }}>
                                                                <strong>Selected Seats:</strong> {selectedSeats.map(s => s.name).join(', ')}
                                                            </div>
                                                        )}

                                                        <div style={{
                                                            backgroundColor: 'var(--rail-green-light)', padding: '15px', borderRadius: '4px', textAlign: 'center',
                                                            fontWeight: 'bold', fontSize: '18px', color: 'var(--rail-green)', border: '1px solid var(--line)', marginBottom: '20px'
                                                        }}>
                                                            Total: ৳ {selectedSeats.length > 0 ? (((train.fares && train.fares[seatClass]) ? train.fares[seatClass] : 0) * selectedSeats.length) : 0}
                                                        </div>

                                                        <button
                                                            onClick={() => handleCheckout(train.train_id)}
                                                            disabled={selectedSeats.length === 0 || checkoutLoading}
                                                            className="btn"
                                                            style={{
                                                                width: '100%', padding: '14px', color: 'white',
                                                                background: selectedSeats.length > 0 ? 'var(--rail-green)' : '#cbd5e1'
                                                            }}
                                                        >
                                                            {checkoutLoading ? <Spinner /> : 'CONTINUE PURCHASE & PAY'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="empty-state">
                                    <span className="icon">🚆</span>
                                    No trains found for this route on this date.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}