import React, { useState, useRef, useEffect } from 'react';
import jsPDF from 'jspdf';
import './App.css';

const API_BASE = 'https://ticketbd-backend.onrender.com';

// --- EXACT BANGLADESH RAILWAY ETICKET.RAILWAY.GOV.BD COACH BLUEPRINTS ---
// 5-Column Grid: [Left 1, Left 2, Aisle (null), Right 1, Right 2]

// 1. 60-Seat Shovon Chair / Snigdha Coach (SCHA, JA, JHA, NEO, TA, THA, DA, TO, THO)
const BLUEPRINT_60_SEAT = [
    [1, null, null, null, null],
    [2, null, null, 3, 4],
    [5, 6, null, 7, 8],
    [9, 10, null, 11, 12],
    [13, 14, null, 15, 16],
    [17, 18, null, 19, 20],
    [21, 22, null, 23, 24],
    [25, 26, null, 27, 28],
    [29, 30, null, 31, 32],
    [null, null, null, null, null], // Middle Aisle Gap
    [33, 34, null, 35, 36],
    [37, 38, null, 39, 40],
    [41, 42, null, 43, 44],
    [45, 46, null, 47, 48],
    [49, 50, null, 51, 52],
    [53, 54, null, 55, 56],
    [57, 58, null, null, 59],
    [null, null, null, null, 60]
];

// 2. 15-Seat Small Coach (KA, DHA)
const BLUEPRINT_15_SEAT = [
    [1, null, null, null, null],
    [2, 3, null, 4, 5],
    [6, 7, null, 8, 9],
    [10, 11, null, 12, 13],
    [14, null, null, null, 15]
];

// 3. 55-Seat Coach (GHA, CHA, GA, UMA, DANT)
const BLUEPRINT_55_SEAT = [
    [1, 2, null, null, 3],
    [4, 5, null, 6, 7],
    [8, 9, null, 10, 11],
    [12, 13, null, 14, 15],
    [16, 17, null, 18, 19],
    [20, 21, null, 22, 23],
    [24, 25, null, 26, 27],
    [null, null, null, null, null], // Middle Aisle Gap
    [28, 29, null, 30, 31],
    [32, 33, null, 34, 35],
    [36, 37, null, 38, 39],
    [40, 41, null, 42, 43],
    [44, 45, null, 46, 47],
    [48, 49, null, 50, 51],
    [52, null, null, 53, 54],
    [55, null, null, null, null]
];

// 4. AC Berth / Cabin Blueprint (33 Berths: 6 cabins)
const BLUEPRINT_AC_B = [
    [1, 2, 3, null, 4, 5, 6],
    [7, 8, 9, null, 10, 11, 12],
    [13, 14, 15, null, 16, 17, 18],
    [19, 20, 21, null, 22, 23, 24],
    [25, 26, 27, null, 28, 29, 30],
    [31, 32, 33, null, null, null, null]
];

// Map by Class or Coach Name
const COACH_MAPS = {
    // Class Fallbacks
    'AC_S': BLUEPRINT_55_SEAT,
    'AC_B': BLUEPRINT_AC_B,
    'SNIGDHA': BLUEPRINT_55_SEAT,
    'F_BERTH': BLUEPRINT_AC_B,
    'F_SEAT': BLUEPRINT_55_SEAT,
    'F_CHAIR': BLUEPRINT_55_SEAT,
    'S_CHAIR': BLUEPRINT_60_SEAT,

    // Specific Coach Blueprints matching Screenshots exactly
    'KA': BLUEPRINT_15_SEAT,
    'DHA': BLUEPRINT_15_SEAT,
    'SCHA': BLUEPRINT_60_SEAT,
    'JA': BLUEPRINT_60_SEAT,
    'JHA': BLUEPRINT_60_SEAT,
    'NEO': BLUEPRINT_60_SEAT,
    'TA': BLUEPRINT_60_SEAT,
    'THA': BLUEPRINT_60_SEAT,
    'DA': BLUEPRINT_60_SEAT,
    'TO': BLUEPRINT_60_SEAT,
    'THO': BLUEPRINT_60_SEAT,
    'GHA': BLUEPRINT_55_SEAT,
    'CHA': BLUEPRINT_55_SEAT,
    'GA': BLUEPRINT_55_SEAT,
    'UMA': BLUEPRINT_55_SEAT,
    'DANT': BLUEPRINT_55_SEAT
};

const DEFAULT_COACHES_BY_CLASS = {
    'AC_S': ['GA', 'GHA', 'UMA'],
    'AC_B': ['GA', 'GHA', 'KHA'],
    'SNIGDHA': ['CHA', 'SCHA', 'JA', 'NEO', 'JHA'],
    'F_BERTH': ['KHA'],
    'F_SEAT': ['KHA'],
    'F_CHAIR': ['KHA', 'GA'],
    'S_CHAIR': ['THA', 'DA', 'DHA', 'DANT', 'TO', 'THO', 'TA', 'KA']
};

function Spinner({ dark }) {
    return <span className={`tb-spinner ${dark ? 'dark' : ''}`} />;
}

// --- STATIC RETURN & REFUND POLICY BOX ---
const REFUND_POLICY_BOX = (
    <div style={{
        backgroundColor: '#fffbe3', border: '1px solid #f0e68c', borderRadius: '8px',
        padding: '14px 18px', marginTop: '16px', fontSize: '12px', color: '#444', lineHeight: '1.6'
    }}>
        <div style={{ fontWeight: 'bold', color: '#b45309', marginBottom: '6px', fontSize: '13px' }}>
            📋 Ticket Return Policy (In Case of Not Resold Portion)
        </div>
        <ul style={{ margin: '0 0 10px 0', paddingLeft: '18px' }}>
            <li>In case of ticket return <strong>48 hours prior</strong> to journey: BDT 40 or 10% of ticket fare (whichever is higher) will be deducted.</li>
            <li>In case of less than <strong>48 hours and more than 24 hours</strong>: BDT 40 or 25% of ticket fare (whichever is higher) will be deducted.</li>
            <li>In case of less than <strong>24 hours and more than 12 hours</strong>: BDT 40 or 50% of ticket fare (whichever is higher) will be deducted.</li>
            <li>For less than <strong>12 hours and more than 06 hours</strong>: BDT 40 or 75% of ticket fare (whichever is higher) will be deducted.</li>
            <li>No refund for less than <strong>06 hours</strong>.</li>
        </ul>
        <div style={{ fontWeight: 'bold', color: '#15803d', marginBottom: '4px' }}>
            🔄 Resold portion: User will get refund of the resold part price.
        </div>
        <div style={{ fontSize: '11px', color: '#777' }}>
            * Service charges (20৳) for online purchase are non-refundable.
        </div>
    </div>
);

// --- DATE & TIME FORMAT HELPERS ---
const formatToDisplayDate = (yyyy_mm_dd) => {
    if (!yyyy_mm_dd) return '';
    const parts = yyyy_mm_dd.split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        return `${d}-${m}-${y}`;
    }
    return yyyy_mm_dd;
};

const formatDateShort = (yyyy_mm_dd) => {
    if (!yyyy_mm_dd) return '';
    const parts = yyyy_mm_dd.split('-');
    if (parts.length === 3) {
        const [y, m, d] = parts;
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const monthIdx = parseInt(m, 10) - 1;
        return `${String(d).padStart(2, '0')} ${months[monthIdx] || ''}`;
    }
    return yyyy_mm_dd;
};

const formatTimeAMPM = (timeStr) => {
    if (!timeStr) return '';
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
};

const calculateDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return '00h 00m';
    const [h1, m1] = startTime.split(':').map(Number);
    const [h2, m2] = endTime.split(':').map(Number);
    let startMinutes = h1 * 60 + m1;
    let endMinutes = h2 * 60 + m2;
    if (endMinutes < startMinutes) {
        endMinutes += 24 * 60; // Overnight
    }
    const diff = endMinutes - startMinutes;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
};

export function App() {
    const [view, setView] = useState('home');

    // --- Station State ---
    const [stationList, setStationList] = useState([]);

    // --- Auth / Session States ---
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [token, setToken] = useState(null);
    const [authMode, setAuthMode] = useState('login');
    const [studentId, setStudentId] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [mobile, setMobile] = useState('');
    const [authMessage, setAuthMessage] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    // --- Search States ---
    const [fromStationName, setFromStationName] = useState('');
    const [toStationName, setToStationName] = useState('');
    const [journeyDate, setJourneyDate] = useState('');
    const [displayDate, setDisplayDate] = useState('');
    const [seatClass, setSeatClass] = useState('SNIGDHA');
    const [trains, setTrains] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);

    // --- Seat Layout & Lock States ---
    const [expandedTrainId, setExpandedTrainId] = useState(null);
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [selectedCoach, setSelectedCoach] = useState('');
    const [coachSeats, setCoachSeats] = useState([]);
    const [coachSummary, setCoachSummary] = useState({});
    const [seatsLoading, setSeatsLoading] = useState(false);

    // --- Payment & 4-Minute Lock Modal ---
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [lockedBookingIds, setLockedBookingIds] = useState([]);
    const [lockSecondsLeft, setLockSecondsLeft] = useState(240);
    const [paymentMethod, setPaymentMethod] = useState('bKash');
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const lockTimerRef = useRef(null);

    // --- My Profile / Tickets States ---
    const [myTickets, setMyTickets] = useState([]);
    const [profileTab, setProfileTab] = useState('tickets');
    const [userProfile, setUserProfile] = useState({ username: '', email: '', phone_number: '', password: '' });
    const [profileMessage, setProfileMessage] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);

    // --- Partial Cancellation Modal States ---
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [selectedCancelTicketIds, setSelectedCancelTicketIds] = useState([]);
    const [cancelModalData, setCancelModalData] = useState(null);
    const [cancelLoading, setCancelLoading] = useState(false);

    // --- Verify Ticket / Contact modals ---
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [pnrInput, setPnrInput] = useState('');
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifyError, setVerifyError] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);

    const toInputRef = useRef(null);
    const dateInputRef = useRef(null);
    const nativeDatePickerRef = useRef(null);
    const classInputRef = useRef(null);

    const getMinMaxDates = () => {
        const today = new Date();
        const minDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        const maxDateObj = new Date(today);
        maxDateObj.setDate(maxDateObj.getDate() + 10);
        const maxDate = new Date(maxDateObj.getTime() - (maxDateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        return { minDate, maxDate };
    };
    const { minDate, maxDate } = getMinMaxDates();

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const verifyToken = searchParams.get('verify');

        if (verifyToken) {
            setView('verify_screen');
            fetch(`${API_BASE}/api/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: verifyToken, studentId: verifyToken })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        setAuthMessage("✅ Account successfully verified & created! You can now log in.");
                    } else {
                        setAuthMessage(data.message || "Verification failed. Link may have expired.");
                    }
                })
                .catch(() => setAuthMessage("Verification failed. Server error."));
        }
    }, []);

    useEffect(() => {
        fetch(`${API_BASE}/api/stations`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setStationList(data);
            })
            .catch(err => console.error("🛑 Failed to load stations from MySQL:", err));
    }, []);

    useEffect(() => {
        const savedToken = localStorage.getItem('tb_token');
        const savedId = localStorage.getItem('tb_studentId');
        if (savedToken && savedId) {
            setToken(savedToken);
            setStudentId(savedId);
            setIsLoggedIn(true);
        }
    }, []);

    useEffect(() => {
        if (showPaymentModal && lockSecondsLeft > 0) {
            lockTimerRef.current = setInterval(() => {
                setLockSecondsLeft(prev => prev - 1);
            }, 1000);
        } else if (lockSecondsLeft <= 0 && showPaymentModal) {
            clearInterval(lockTimerRef.current);
            alert("⏰ Seat lock expired! The 4-minute payment window has ended. Please select your seats again.");
            setShowPaymentModal(false);
            setLockedBookingIds([]);
            setSelectedSeats([]);
            if (expandedTrainId && selectedCoach && journeyDate) {
                fetchCoachSeats(expandedTrainId, selectedCoach, journeyDate);
                fetchCoachSummary(expandedTrainId, journeyDate);
            }
        }
        return () => clearInterval(lockTimerRef.current);
    }, [showPaymentModal, lockSecondsLeft]);

    const authFetch = (url, options = {}) => {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch(url, { ...options, headers });
    };

    const getStationIdByName = (name) => {
        if (!name) return null;
        const match = stationList.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
        return match ? match.id : null;
    };

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

    // =========================================================================
    // 🚂 BANGLADESH RAILWAY E-TICKET PDF GENERATOR (WITH USER'S FULL NAME)
    // =========================================================================
    const generatePDF = (ticket) => {
        const doc = new jsPDF('p', 'mm', 'a4');

        const primaryGreen = [11, 110, 79];     // #0b6e4f
        const textDark = [30, 40, 35];          // #1e2823
        const lightBg = [248, 250, 252];        // #f8fafc
        const lineGray = [215, 222, 218];       // #d7dee0

        // 1. Outer Frame Border
        doc.setDrawColor(...primaryGreen);
        doc.setLineWidth(1.2);
        doc.rect(10, 10, 190, 277);

        // 2. Top Header - Logo Emblem & Title
        doc.setFillColor(...primaryGreen);
        doc.circle(22, 22, 7, 'F');
        doc.setFillColor(230, 164, 25);
        doc.circle(22, 22, 3.5, 'F');

        doc.setTextColor(...primaryGreen);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text('BANGLADESH RAILWAY', 105, 20, { align: 'center' });

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text('E-TICKET / BOARDING PASS', 105, 26, { align: 'center' });

        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.setFont("helvetica", "normal");
        doc.text('Powered by', 185, 17, { align: 'right' });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text('Bermuda Triangle', 185, 21, { align: 'right' });

        let curY = 52;

        doc.setFillColor(...primaryGreen);
        doc.rect(15, curY, 180, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.text('Journey Information (Journey Details)', 18, curY + 5);

        curY += 7;

        const baseFare = parseFloat(ticket.price_paid || 0);
        const vat = baseFare * 0.15;
        const serviceCharge = 20.00;
        const totalFare = baseFare + vat + serviceCharge;

        const journeyTableData = [
            ['Issue Date & Time:', new Date(ticket.payment_date || Date.now()).toLocaleString()],
            ['Journey Date & Time:', `${formatToDisplayDate(ticket.journey_date)}`],
            ['Train Name & Number:', `${ticket.train_name} [${ticket.train_number}]`],
            ['From Station:', ticket.start_station],
            ['To Station:', ticket.end_station],
            ['Class Name:', ticket.class],
            ['Coach Name / Seat(s):', `${ticket.coach_name}-${ticket.seat_number}`],
            ['No. of Seats:', '1'],
            ['No. of Passenger(s):', '1'],
            ['Fare:', `BDT ${baseFare.toFixed(2)}`],
            ['VAT:', `BDT ${vat.toFixed(2)}`],
            ['Service Charge:', `BDT ${serviceCharge.toFixed(2)}`],
            ['Total Fare:**', `BDT ${totalFare.toFixed(2)}`]
        ];

        doc.setLineWidth(0.2);
        doc.setDrawColor(...lineGray);

        journeyTableData.forEach(([label, val], idx) => {
            const isTotalRow = label.startsWith('Total Fare');
            const rowHeight = 6;

            if (idx % 2 === 0) {
                doc.setFillColor(...lightBg);
                doc.rect(15, curY, 180, rowHeight, 'F');
            }
            doc.rect(15, curY, 180, rowHeight, 'S');
            doc.line(110, curY, 110, curY + rowHeight);

            doc.setFontSize(8);
            if (isTotalRow) {
                doc.setFont("helvetica", "bold");
                doc.setTextColor(...primaryGreen);
            } else {
                doc.setFont("helvetica", "normal");
                doc.setTextColor(...textDark);
            }

            doc.text(label, 18, curY + 4.2);
            doc.setFont("helvetica", "bold");
            doc.text(val, 113, curY + 4.2);

            curY += rowHeight;
        });

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text('** Total Fare does not includes BDT 20 Service Charges per seat.', 15, curY + 4);

        curY += 9;

        doc.setFillColor(...primaryGreen);
        doc.rect(15, curY, 180, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.text('Passenger Information (Passenger Details)', 18, curY + 5);

        curY += 7;

        const passengerName = ticket.username || ticket.full_name || ticket.passenger_name || userProfile.username || `CUET Student (${studentId})`;

        const passengerTableData = [
            ['Passenger Name:', passengerName],
            ['Identification Type:', 'Student ID'],
            ['Identification Number:', studentId],
            ['Mobile Number:', ticket.user_phone || 'N/A'],
            ['PNR Number:', ticket.transaction_id || 'N/A']
        ];

        passengerTableData.forEach(([label, val], idx) => {
            const rowHeight = 6;
            if (idx % 2 === 0) {
                doc.setFillColor(...lightBg);
                doc.rect(15, curY, 180, rowHeight, 'F');
            }
            doc.rect(15, curY, 180, rowHeight, 'S');
            doc.line(110, curY, 110, curY + rowHeight);

            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...textDark);
            doc.text(label, 18, curY + 4.2);

            doc.setFont("helvetica", "bold");
            if (label === 'PNR Number:') doc.setTextColor(...primaryGreen);
            doc.text(val, 113, curY + 4.2);

            curY += rowHeight;
        });

        curY += 8;

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...textDark);
        doc.text('Please Note :-', 15, curY);

        curY += 4;
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(90, 90, 90);

        const notes = [
            '• Carrying NID or Student ID Card while travelling is mandatory for each passenger.',
            '• You can carry either a soft copy or printed copy of your e-ticket while travelling.',
            '• No need to print e-ticket from the counter.'
        ];

        notes.forEach(note => {
            doc.text(note, 15, curY);
            curY += 4;
        });

        curY += 3;

        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(0.6);
        doc.roundedRect(15, curY, 180, 10, 2, 2, 'FD');

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(185, 28, 28);
        doc.text(
            'Railway Service Helpline: 131  |  Railway Police Hotline: 01320177568',
            105, curY + 6.2, { align: 'center' }
        );

        curY += 16;

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...primaryGreen);
        doc.text('Wishing you a pleasant and safe journey - Bangladesh Railway', 105, curY, { align: 'center' });

        doc.save(`BangladeshRailway_Ticket_${ticket.transaction_id}.pdf`);
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
                    body: JSON.stringify({ studentId, mobile, password, fullName, username: fullName })
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

    const openCancelModal = (ticketList) => {
        const activeTickets = ticketList.filter(t => t.ticket_status === 'ACTIVE');
        if (activeTickets.length === 0) return;

        const initialSelectedIds = activeTickets.map(t => t.ticket_id);
        setSelectedCancelTicketIds(initialSelectedIds);

        const totalFare = activeTickets.reduce((sum, t) => sum + parseFloat(t.price_paid || 0), 0);
        const serviceFee = activeTickets.length * 20.00;
        const estimatedRefund = Math.max(0, totalFare - serviceFee);

        setCancelModalData({
            tickets: activeTickets,
            pnr: activeTickets[0].transaction_id,
            totalFare,
            serviceFee,
            estimatedRefund
        });
        setShowCancelModal(true);
    };

    const toggleCancelTicketSelection = (ticketId) => {
        setSelectedCancelTicketIds(prev => {
            const updated = prev.includes(ticketId)
                ? prev.filter(id => id !== ticketId)
                : [...prev, ticketId];

            if (cancelModalData) {
                const selectedTickets = cancelModalData.tickets.filter(t => updated.includes(t.ticket_id));
                const totalFare = selectedTickets.reduce((sum, t) => sum + parseFloat(t.price_paid || 0), 0);
                const serviceFee = selectedTickets.length * 20.00;
                const estimatedRefund = Math.max(0, totalFare - serviceFee);

                setCancelModalData(prevData => ({
                    ...prevData,
                    totalFare,
                    serviceFee,
                    estimatedRefund
                }));
            }

            return updated;
        });
    };

    const handleConfirmCancellation = async () => {
        if (selectedCancelTicketIds.length === 0) {
            alert("Please select at least one seat to cancel.");
            return;
        }

        setCancelLoading(true);
        try {
            const response = await authFetch(`${API_BASE}/api/cancel-ticket`, {
                method: 'POST',
                body: JSON.stringify({
                    ticketIds: selectedCancelTicketIds,
                    studentId
                })
            });
            if (response.status === 401 || response.status === 403) return handleSessionExpired();
            const data = await response.json();
            if (data.success) {
                alert(data.message);
                setShowCancelModal(false);
                setSelectedCancelTicketIds([]);
                setCancelModalData(null);
                loadProfileData();
            } else {
                alert("Cancellation failed: " + data.message);
            }
        } catch (error) {
            console.error("Cancellation error:", error);
            alert("A network error occurred while trying to cancel.");
        }
        setCancelLoading(false);
    };

    // --- SEARCH TRAINS HANDLER ---
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
        if (!journeyDate) {
            alert("Please select or type a valid journey date in DD/MM/YYYY format.");
            return;
        }
        setSearchLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/trains?fromStation=${fromId}&toStation=${toId}&journeyDate=${journeyDate}`);
            const data = await response.json();

            const todayStr = new Date().toISOString().split('T')[0];
            let filteredTrains = Array.isArray(data) ? data : [];

            if (journeyDate === todayStr) {
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();

                filteredTrains = filteredTrains.filter(train => {
                    if (!train.start_time) return true;
                    const [h, m] = train.start_time.split(':').map(Number);
                    const trainMinutes = h * 60 + m;
                    return trainMinutes > currentMinutes;
                });
            }

            setTrains(filteredTrains);
            setExpandedTrainId(null);
            setSelectedSeats([]);
            setView('results');
        } catch (err) {
            console.error("Error fetching trains:", err);
            alert("Could not fetch trains. Is the backend running?");
        }
        setSearchLoading(false);
    };

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

    const fetchCoachSummary = async (targetTrainId, targetDate) => {
        try {
            const response = await fetch(`${API_BASE}/api/coach-summary?trainId=${targetTrainId}&journeyDate=${targetDate}`);
            const data = await response.json();
            if (data.success) setCoachSummary(data.summary || {});
        } catch (err) {
            console.error("Failed to fetch coach summary", err);
        }
    };

    const handleSeatSelect = (seatId, seatName, isBooked) => {
        if (isBooked) return;
        setSelectedSeats((prevSelected) => {
            const isAlreadySelected = prevSelected.some(seat => seat.id === seatId);
            if (isAlreadySelected) return prevSelected.filter(seat => seat.id !== seatId);

            if (prevSelected.length >= 4) {
                alert("You can select a maximum of 4 seats per booking.");
                return prevSelected;
            }
            return [...prevSelected, { id: seatId, name: seatName }];
        });
    };

    const handleProceedToPayment = async (trainId) => {
        if (selectedSeats.length === 0) {
            alert("Please select at least one seat.");
            return;
        }

        const fromId = getStationIdByName(fromStationName);
        const toId = getStationIdByName(toStationName);

        const lockPayload = {
            userId: studentId,
            trainId: trainId,
            startStationId: fromId,
            endStationId: toId,
            journeyDate: journeyDate,
            selectedSeats: selectedSeats.map(seat => ({ seat_id: seat.id }))
        };

        setCheckoutLoading(true);
        try {
            const response = await authFetch(`${API_BASE}/api/lock-seats`, {
                method: 'POST',
                body: JSON.stringify(lockPayload)
            });
            if (response.status === 401 || response.status === 403) return handleSessionExpired();
            const data = await response.json();

            if (data.success) {
                setLockedBookingIds(data.bookingIds);
                setLockSecondsLeft(240);
                setShowPaymentModal(true);
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error("Error locking seats:", error);
            alert("A network error occurred while locking your seats.");
        }
        setCheckoutLoading(false);
    };

    const handleConfirmPayment = async () => {
        if (lockedBookingIds.length === 0) {
            alert("No locked seats found.");
            return;
        }

        const checkoutPayload = {
            userId: studentId,
            bookingIds: lockedBookingIds,
            paymentMethod: paymentMethod
        };

        setCheckoutLoading(true);
        try {
            const response = await authFetch(`${API_BASE}/api/checkout`, {
                method: 'POST',
                body: JSON.stringify(checkoutPayload)
            });
            if (response.status === 401 || response.status === 403) return handleSessionExpired();
            const data = await response.json();

            if (data.success) {
                alert("🎉 Payment confirmed! Your e-tickets have been generated.");
                setShowPaymentModal(false);
                setSelectedSeats([]);
                setLockedBookingIds([]);
                if (expandedTrainId && selectedCoach && journeyDate) {
                    fetchCoachSeats(expandedTrainId, selectedCoach, journeyDate);
                    fetchCoachSummary(expandedTrainId, journeyDate);
                }
                setProfileTab('tickets');
                loadProfileData();
            } else {
                alert("Checkout failed: " + data.message);
            }
        } catch (error) {
            console.error("Error during checkout:", error);
            alert("A network error occurred.");
        }
        setCheckoutLoading(false);
    };

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

    const isCancellable = (journeyDateStr) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [year, month, day] = journeyDateStr.split('-');
        const journeyDateObj = new Date(year, month - 1, day);

        return journeyDateObj >= today;
    };

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

    const formatTimeLeft = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const groupedTickets = myTickets.reduce((groups, ticket) => {
        const key = ticket.transaction_id || `SINGLE-${ticket.ticket_id}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(ticket);
        return groups;
    }, {});

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
                                {userProfile.username || studentId}
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
                                <p style={{ margin: '4px 0' }}><strong>Journey Date:</strong> {formatToDisplayDate(verifyResult.journey_date)}</p>
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

            {/* ================= PAYMENT & 4-MINUTE LOCK MODAL ================= */}
            {showPaymentModal && (
                <div className="tb-modal-overlay">
                    <div className="tb-modal" style={{ maxWidth: '480px' }}>
                        <div style={{
                            backgroundColor: 'var(--amber-light)', color: 'var(--amber-dark)', padding: '10px 14px',
                            borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', textAlign: 'center', marginBottom: '18px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span>🔒 Seats Locked Temporarily</span>
                            <span style={{ fontSize: '16px', fontFamily: 'var(--font-mono)' }}>⏱️ {formatTimeLeft(lockSecondsLeft)}</span>
                        </div>

                        <h2 style={{ margin: '0 0 12px 0', fontSize: '20px' }}>Complete Your Booking</h2>
                        <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '15px' }}>
                            Your selected seats are reserved for 4 minutes. Please select your payment method to finalize.
                        </p>

                        <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid var(--line)', marginBottom: '18px', fontSize: '13px' }}>
                            <div style={{ marginBottom: '6px' }}><strong>Seats:</strong> {selectedSeats.map(s => s.name).join(', ')}</div>
                            <div style={{ marginBottom: '6px' }}><strong>Journey Date:</strong> {formatToDisplayDate(journeyDate)}</div>
                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--rail-green)', marginTop: '10px' }}>
                                Total Amount: ৳ {(() => {
                                const train = trains.find(t => t.train_id === expandedTrainId);
                                const fare = (train && train.fares && train.fares[seatClass]) ? train.fares[seatClass] : 0;
                                return (fare * selectedSeats.length).toFixed(2);
                            })()}
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Select Payment Gateway</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                {['bKash', 'Nagad', 'Rocket'].map(pm => (
                                    <div
                                        key={pm}
                                        onClick={() => setPaymentMethod(pm)}
                                        style={{
                                            padding: '10px', textAlign: 'center', borderRadius: '6px', cursor: 'pointer',
                                            fontWeight: 'bold', fontSize: '13px',
                                            border: paymentMethod === pm ? '2px solid var(--rail-green)' : '1px solid var(--line)',
                                            backgroundColor: paymentMethod === pm ? 'var(--rail-green-light)' : '#fff',
                                            color: paymentMethod === pm ? 'var(--rail-green-dark)' : 'var(--ink)'
                                        }}
                                    >
                                        {pm}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                className="btn btn-ghost"
                                style={{ flex: 1, padding: '12px' }}
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    setLockedBookingIds([]);
                                }}
                            >
                                CANCEL
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ flex: 2, padding: '12px' }}
                                disabled={checkoutLoading}
                                onClick={handleConfirmPayment}
                            >
                                {checkoutLoading ? <Spinner /> : 'CONFIRM & PAY'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= PARTIAL / FULL CANCELLATION MODAL ================= */}
            {showCancelModal && cancelModalData && (
                <div className="tb-modal-overlay" onClick={() => setShowCancelModal(false)}>
                    <div className="tb-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
                        <button className="tb-modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
                        <span className="eyebrow" style={{ color: 'var(--red)' }}>Ticket Cancellation</span>
                        <h2 style={{ margin: '4px 0 10px 0', fontSize: '20px' }}>Select Seats to Cancel</h2>
                        <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '16px' }}>
                            PNR: <strong>{cancelModalData.pnr}</strong> — Select individual seats to cancel. Remaining seats stay active.
                        </p>

                        <div style={{ marginBottom: '18px', display: 'grid', gap: '10px', maxHeight: '180px', overflowY: 'auto' }}>
                            {cancelModalData.tickets.map(t => {
                                const isChecked = selectedCancelTicketIds.includes(t.ticket_id);
                                return (
                                    <label
                                        key={t.ticket_id}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--line)',
                                            backgroundColor: isChecked ? 'var(--red-light)' : '#fff', cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleCancelTicketSelection(t.ticket_id)}
                                                style={{ width: '16px', height: '16px', accentColor: 'var(--red)' }}
                                            />
                                            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Seat {t.coach_name}-{t.seat_number} ({t.class})</span>
                                        </div>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>৳ {parseFloat(t.price_paid).toFixed(2)}</span>
                                    </label>
                                );
                            })}
                        </div>

                        <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid var(--line)', marginBottom: '16px', fontSize: '13px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span>Selected Seat Fare:</span>
                                <strong>৳ {cancelModalData.totalFare.toFixed(2)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--red)' }}>
                                <span>Service Fee (৳ 20 / seat):</span>
                                <strong>- ৳ {cancelModalData.serviceFee.toFixed(2)}</strong>
                            </div>
                            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '8px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 'bold', color: 'var(--rail-green)' }}>
                                <span>Estimated Refund Amount:</span>
                                <span>৳ {cancelModalData.estimatedRefund.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Static Ticket Return & Refund Policy */}
                        {REFUND_POLICY_BOX}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                            <button className="btn btn-ghost" style={{ flex: 1, padding: '12px' }} onClick={() => setShowCancelModal(false)}>
                                CANCEL
                            </button>
                            <button
                                className="btn btn-danger"
                                style={{ flex: 2, padding: '12px' }}
                                disabled={cancelLoading || selectedCancelTicketIds.length === 0}
                                onClick={handleConfirmCancellation}
                            >
                                {cancelLoading ? <Spinner /> : `CANCEL ${selectedCancelTicketIds.length} SEAT(S)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ paddingBottom: '50px', flex: 1 }}>
                {/* ================= VERIFICATION SCREEN ================= */}
                {view === 'verify_screen' && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 80px)' }}>
                        <div className="card" style={{ padding: '40px', textAlign: 'center', maxWidth: '440px' }}>
                            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📧</div>
                            <h2 style={{ color: 'var(--rail-green)', margin: '0 0 10px 0' }}>Email Verification</h2>
                            <p style={{ fontWeight: 'bold', margin: '15px 0', fontSize: '14px', lineHeight: '1.5' }}>
                                {authMessage || 'Verifying your email and creating your account...'}
                            </p>
                            <button
                                className="btn btn-primary"
                                style={{ padding: '12px 24px', marginTop: '10px' }}
                                onClick={() => {
                                    window.history.replaceState(null, '', window.location.pathname);
                                    setView('auth');
                                    setAuthMode('login');
                                }}>
                                PROCEED TO LOGIN
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
                                {authMode === 'signup' && (
                                    <div style={{ marginBottom: '15px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#333' }}>Full Name</label>
                                        <input
                                            type="text"
                                            placeholder="Enter Your Full Name"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            required
                                            className="input-field"
                                        />
                                    </div>
                                )}
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
                                {/* Static Ticket Return & Refund Policy */}
                                {REFUND_POLICY_BOX}
                                <div style={{ marginTop: '20px' }}>
                                    {Object.keys(groupedTickets).length === 0 ? (
                                        <div className="empty-state">
                                            <span className="icon">🎫</span>
                                            You have no booked tickets in the last 15 days.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '22px' }}>
                                            {Object.entries(groupedTickets).map(([pnr, ticketGroup]) => {
                                                const firstTicket = ticketGroup[0];
                                                const activeInGroup = ticketGroup.filter(t => t.ticket_status === 'ACTIVE');
                                                const isGroupActive = activeInGroup.length > 0;
                                                const seatListStr = ticketGroup.map(t => `${t.coach_name}-${t.seat_number}`).join(', ');
                                                const badge = refundBadge(firstTicket);

                                                return (
                                                    <div key={pnr} className={`ticket-stub ${!isGroupActive ? 'is-cancelled' : ''}`}>
                                                        <div className="ticket-stub-main">
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                                                <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '17px' }}>
                                                                    {firstTicket.train_name} ({firstTicket.train_number})
                                                                </h3>
                                                                {badge && <span className={`badge ${badge.cls}`}>{badge.label}</span>}
                                                            </div>
                                                            <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}><strong>Journey:</strong> {formatToDisplayDate(firstTicket.journey_date)}</p>
                                                            <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}><strong>Route:</strong> {firstTicket.start_station} to {firstTicket.end_station}</p>
                                                            <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}><strong>Seat(s):</strong> {seatListStr}</p>
                                                            <p className="pnr" style={{ margin: '8px 0 0 0' }}>PNR: {pnr}</p>

                                                            {firstTicket.ticket_status === 'CANCELLED' && (
                                                                <div style={{
                                                                    margin: '14px 0 0 0', padding: '12px',
                                                                    backgroundColor: firstTicket.refund_status === 'PENDING_RESALE' ? 'var(--amber-light)' : 'var(--rail-green-light)',
                                                                    borderRadius: '6px'
                                                                }}>
                                                                    {firstTicket.refund_status === 'PENDING_RESALE' && (
                                                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--amber-dark)', lineHeight: '1.5' }}>
                                                                            ⏳ Waiting to see if cancelled seat(s) are resold.<br />
                                                                            Estimated refund if not resold: <strong>৳ {firstTicket.potential_partial_refund ? parseFloat(firstTicket.potential_partial_refund).toFixed(2) : 'TBD'}</strong> (full refund if resold).
                                                                        </p>
                                                                    )}
                                                                    {firstTicket.refund_status === 'RESOLD_FULL_REFUND' && (
                                                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--rail-green-dark)', lineHeight: '1.5' }}>
                                                                            ✅ Seat(s) resold to another passenger — full refund of <strong>৳ {parseFloat(firstTicket.refunded_amount).toFixed(2)}</strong> issued.
                                                                        </p>
                                                                    )}
                                                                    {firstTicket.refund_status === 'EXPIRED_PARTIAL_REFUND' && (
                                                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--red)', lineHeight: '1.5' }}>
                                                                            Journey date passed — partial refund of <strong>৳ {parseFloat(firstTicket.refunded_amount).toFixed(2)}</strong> issued after deducting service fee.
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {isGroupActive && (
                                                            <>
                                                                <div className="ticket-stub-tear" />
                                                                <div className="ticket-stub-side" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                    <button className="btn btn-amber" onClick={(e) => { e.stopPropagation(); generatePDF(firstTicket); }}>
                                                                        DOWNLOAD PDF
                                                                    </button>
                                                                    {isCancellable(firstTicket.journey_date) ? (
                                                                        <button className="btn btn-danger" style={{ fontSize: '12px' }} onClick={(e) => { e.stopPropagation(); openCancelModal(ticketGroup); }}>
                                                                            CANCEL / PARTIAL CANCEL
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

                                    {/* 3. CUSTOM DATE INPUT (DD/MM/YYYY TYPABLE + VISIBLE CALENDAR ICON) */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>
                                            Date of Journey (DD/MM/YYYY)
                                        </label>
                                        <div className="date-input-wrapper">
                                            <input
                                                type="text"
                                                ref={dateInputRef}
                                                placeholder="DD/MM/YYYY"
                                                value={displayDate}
                                                maxLength={10}
                                                onChange={(e) => {
                                                    let val = e.target.value.replace(/\D/g, '');
                                                    if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                                                    if (val.length > 5) val = val.slice(0, 5) + '/' + val.slice(5, 9);
                                                    setDisplayDate(val);

                                                    if (val.length === 10) {
                                                        const [d, m, y] = val.split('/');
                                                        const dbDate = `${y}-${m}-${d}`;
                                                        setJourneyDate(dbDate);
                                                        classInputRef.current?.focus();
                                                    } else {
                                                        setJourneyDate('');
                                                    }
                                                }}
                                                required
                                                className="input-field date-text-field"
                                            />

                                            <div
                                                className="calendar-icon-btn"
                                                title="Open Calendar"
                                                onClick={() => {
                                                    if (nativeDatePickerRef.current?.showPicker) {
                                                        nativeDatePickerRef.current.showPicker();
                                                    } else {
                                                        nativeDatePickerRef.current?.focus();
                                                    }
                                                }}
                                            >
                                                📅
                                                <input
                                                    type="date"
                                                    ref={nativeDatePickerRef}
                                                    min={minDate}
                                                    max={maxDate}
                                                    value={journeyDate}
                                                    onChange={(e) => {
                                                        const selectedDbDate = e.target.value;
                                                        setJourneyDate(selectedDbDate);
                                                        if (selectedDbDate) {
                                                            setDisplayDate(formatToDisplayDate(selectedDbDate));
                                                            classInputRef.current?.focus();
                                                        }
                                                    }}
                                                    className="native-date-hidden-input"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 4. CLASS DROPDOWN */}
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>Choose Class</label>
                                        <select ref={classInputRef} value={seatClass} onChange={e => setSeatClass(e.target.value)} className="input-field">
                                            <option value="SNIGDHA">SNIGDHA (AC Chair)</option>
                                            <option value="S_CHAIR">S_CHAIR (Shovon Chair)</option>
                                            <option value="AC_B">AC_B (AC Sleeper)</option>
                                            <option value="AC_S">AC_S (AC Seat)</option>
                                            <option value="F_BERTH">F_BERTH (First Berth)</option>
                                            <option value="F_SEAT">F_SEAT (First Seat)</option>
                                            <option value="F_CHAIR">F_CHAIR (First Chair)</option>
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

                {/* ================= RESULTS PAGE (OFFICIAL BANGLADESH RAILWAY SEARCH RESULT CARDS) ================= */}
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
                                    <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{formatToDisplayDate(journeyDate)}</div>
                                </div>
                            </div>
                            <button className="btn btn-amber" style={{ padding: '8px 18px', fontSize: '12px' }} onClick={() => setView('home')}>MODIFY SEARCH</button>
                        </div>

                        <div style={{ maxWidth: '1200px', margin: '25px auto', padding: '0 20px' }}>
                            {Array.isArray(trains) && trains.length > 0 ? (
                                trains.map((train) => {
                                    const trainFares = train.fares || {};
                                    const availableClasses = Object.keys(trainFares).filter(cls => {
                                        const f = trainFares[cls];
                                        return f !== undefined && f !== null && f !== 'N/A' && Number(f) > 0;
                                    });

                                    const displayClasses = availableClasses.length > 0
                                        ? availableClasses
                                        : Object.keys(DEFAULT_COACHES_BY_CLASS).filter(cls => train.classAvailability && train.classAvailability[cls] !== undefined);

                                    return (
                                        <div key={train.train_id} className="card" style={{ padding: '25px', marginBottom: '25px', border: '1px solid #e2e8f0' }}>
                                            {/* Train Header Title */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                                <div>
                                                    <h3 style={{ margin: 0, color: 'var(--amber-dark)', fontSize: '20px', fontWeight: 'bold', letterSpacing: '0.3px' }}>
                                                        {train.train_name.toUpperCase()} ({train.train_number})
                                                    </h3>
                                                </div>
                                            </div>

                                            {/* Timeline Route Card */}
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                backgroundColor: '#f8fafc', padding: '16px 24px', borderRadius: '8px',
                                                border: '1px solid #e2e8f0', marginBottom: '20px'
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>
                                                        {formatDateShort(journeyDate)}, {formatTimeAMPM(train.start_time)}
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px', fontWeight: '500' }}>
                                                        {fromStationName}
                                                    </div>
                                                </div>

                                                <div style={{ flex: 1, maxWidth: '240px', margin: '0 30px', textAlign: 'center', position: 'relative' }}>
                                                    <div style={{ height: '2px', backgroundColor: '#cbd5e1', width: '100%', position: 'absolute', top: '50%', transform: 'translateY(-50%)' }} />
                                                    <span style={{
                                                        position: 'relative', zIndex: 1, backgroundColor: '#fff', border: '1px solid #cbd5e1',
                                                        padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', color: '#475569'
                                                    }}>
                                                        {calculateDuration(train.start_time, train.end_time)}
                                                    </span>
                                                </div>

                                                <div>
                                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>
                                                        {formatDateShort(journeyDate)}, {formatTimeAMPM(train.end_time)}
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px', fontWeight: '500' }}>
                                                        {toStationName}
                                                    </div>
                                                </div>

                                                <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '20px' }}>🪧</span>
                                                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--rail-green)', marginTop: '2px' }}>Train Details</span>
                                                </div>
                                            </div>

                                            {/* Seat Class Selection Cards Grid */}
                                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
                                                {displayClasses.map(cls => {
                                                    const isSelectedClass = expandedTrainId === train.train_id && seatClass === cls;
                                                    const classFare = (train.fares && train.fares[cls]) ? train.fares[cls] : 'N/A';
                                                    const classAvail = train.classAvailability ? train.classAvailability[cls] : null;

                                                    return (
                                                        <div key={cls} onClick={() => {
                                                            setExpandedTrainId(train.train_id);
                                                            setSeatClass(cls);
                                                            setSelectedSeats([]);
                                                            const coachesForCls = (coachSummary && coachSummary[cls])
                                                                ? Object.keys(coachSummary[cls])
                                                                : (DEFAULT_COACHES_BY_CLASS[cls] || []);
                                                            const firstCoach = coachesForCls[0] || 'KA';
                                                            setSelectedCoach(firstCoach);
                                                            fetchCoachSeats(train.train_id, firstCoach, journeyDate);
                                                            fetchCoachSummary(train.train_id, journeyDate);
                                                        }} style={{
                                                            border: isSelectedClass ? '2px solid var(--rail-green)' : '1px solid #cbd5e1',
                                                            borderRadius: '8px', padding: '16px', width: '170px',
                                                            backgroundColor: isSelectedClass ? '#e4f3ec' : '#f8fafc',
                                                            cursor: 'pointer', display: 'flex', flexDirection: 'column',
                                                            boxShadow: isSelectedClass ? '0 4px 12px rgba(11,110,79,0.15)' : 'none',
                                                            transition: 'all 0.15s ease'
                                                        }}>
                                                            <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '16px' }}>{cls}</div>
                                                            <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--rail-green)', marginTop: '4px' }}>
                                                                ৳{classFare}
                                                            </div>
                                                            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '12px' }}>Including VAT</div>

                                                            <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                                                                Available Tickets<br /><span style={{ fontSize: '10px', color: '#94a3b8' }}>(Counter + Online)</span>
                                                            </div>

                                                            <div style={{
                                                                fontSize: '18px', fontWeight: 'bold',
                                                                color: classAvail === 0 ? 'var(--red)' : 'var(--rail-green)',
                                                                marginBottom: '14px'
                                                            }}>
                                                                {classAvail !== null ? classAvail : 'Available'}
                                                            </div>

                                                            <button className={isSelectedClass ? 'btn btn-primary' : ''} style={{
                                                                marginTop: 'auto', padding: '10px', width: '100%',
                                                                background: isSelectedClass ? 'var(--rail-green)' : 'var(--rail-green)',
                                                                color: '#fff', border: 'none', borderRadius: '20px', fontWeight: 'bold', fontSize: '12px'
                                                            }}>
                                                                {isSelectedClass ? 'SELECTED' : 'BOOK NOW'}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Seat Map View when a Class is Selected */}
                                            {expandedTrainId === train.train_id && seatClass && (
                                                <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '20px', display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                                                    <div style={{ backgroundColor: '#f8fafc', padding: '25px', borderRadius: '12px', border: '1px solid #e2e8f0', width: 'fit-content' }}>

                                                        {/* Coach Dropdown */}
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
                                                                    fetchCoachSummary(train.train_id, journeyDate);
                                                                }}
                                                            >
                                                                {(() => {
                                                                    const coachesForSelectedClass = (coachSummary && coachSummary[seatClass])
                                                                        ? Object.keys(coachSummary[seatClass])
                                                                        : (DEFAULT_COACHES_BY_CLASS[seatClass] || []);

                                                                    return coachesForSelectedClass.map(coach => {
                                                                        const availInfo = coachSummary[seatClass]?.[coach];
                                                                        const availCount = availInfo ? availInfo.available : (coach === 'KA' ? 15 : 60);
                                                                        return (
                                                                            <option key={coach} value={coach}>
                                                                                {coach} ({availCount} Seats)
                                                                            </option>
                                                                        );
                                                                    });
                                                                })()}
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
                                                                <div className="seat booked" style={{ width: '18px', height: '18px', borderRadius: '4px' }}></div>Booked / Reserved
                                                            </div>
                                                        </div>

                                                        {seatsLoading ? (
                                                            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Spinner dark /></div>
                                                        ) : (
                                                            (() => {
                                                                const blueprint = COACH_MAPS[selectedCoach] || COACH_MAPS[seatClass] || BLUEPRINT_60_SEAT;
                                                                const gridCols = blueprint[0] ? blueprint[0].length : 5;
                                                                const maxSeatInCoach = coachSeats.reduce((max, s) => Math.max(max, Number(s.seat_number) || 0), 0);

                                                                return (
                                                                    <div style={{
                                                                        display: 'grid',
                                                                        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                                                                        gap: '12px',
                                                                        maxHeight: '450px',
                                                                        overflowY: 'auto',
                                                                        paddingRight: '10px'
                                                                    }}>
                                                                        {blueprint.map((row, rowIndex) => (
                                                                            row.map((seatNumber, colIndex) => {
                                                                                if (seatNumber === null) {
                                                                                    return <div key={`empty-${rowIndex}-${colIndex}`} className="seat empty-space" />;
                                                                                }

                                                                                if (maxSeatInCoach > 0 && seatNumber > maxSeatInCoach) {
                                                                                    return <div key={`empty-over-${rowIndex}-${colIndex}`} className="seat empty-space" />;
                                                                                }

                                                                                const dbSeat = coachSeats.find(s => Number(s.seat_number) === seatNumber);
                                                                                if (!dbSeat) {
                                                                                    return <div key={`loading-${seatNumber}`} className="seat booked" style={{ opacity: 0.3 }}>{seatNumber}</div>;
                                                                                }
                                                                                const fullSeatName = `${dbSeat.coach_name}-${dbSeat.seat_number}`;
                                                                                const isSelected = selectedSeats.some(s => s.id === dbSeat.seat_id);
                                                                                const isBooked = dbSeat.is_booked === 1 || dbSeat.is_booked === true;
                                                                                const isPendingLock = dbSeat.is_pending === 1 || dbSeat.is_pending === true;

                                                                                return (
                                                                                    <div
                                                                                        key={dbSeat.seat_id}
                                                                                        onClick={() => handleSeatSelect(dbSeat.seat_id, fullSeatName, isBooked)}
                                                                                        className={`seat ${isBooked ? 'booked' : isPendingLock ? 'pending' : isSelected ? 'selected' : 'available'}`}
                                                                                        style={{ width: '100%', height: '40px', fontSize: '12px', padding: '0 10px' }}
                                                                                    >
                                                                                        {fullSeatName}
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()
                                                        )}
                                                    </div>

                                                    <div className="card" style={{ flex: 1, minWidth: '300px', padding: '25px' }}>
                                                        <h3 style={{ margin: '0 0 20px 0', borderBottom: '2px solid #edf2f7', paddingBottom: '10px' }}>Seat Details</h3>

                                                        {selectedSeats.length > 0 && (
                                                            <div style={{ marginBottom: '20px', fontSize: '14px', color: '#4a5568' }}>
                                                                <strong>Selected Seats ({selectedSeats.length}/4 max):</strong> {selectedSeats.map(s => s.name).join(', ')}
                                                            </div>
                                                        )}

                                                        <div style={{
                                                            backgroundColor: 'var(--rail-green-light)', padding: '15px', borderRadius: '4px', textAlign: 'center',
                                                            fontWeight: 'bold', fontSize: '18px', color: 'var(--rail-green)', border: '1px solid var(--line)', marginBottom: '20px'
                                                        }}>
                                                            Total: ৳ {selectedSeats.length > 0 ? (((train.fares && train.fares[seatClass]) ? train.fares[seatClass] : 0) * selectedSeats.length).toFixed(2) : '0.00'}
                                                        </div>

                                                        <button
                                                            onClick={() => handleProceedToPayment(train.train_id)}
                                                            disabled={selectedSeats.length === 0 || checkoutLoading}
                                                            className="btn"
                                                            style={{
                                                                width: '100%', padding: '14px', color: 'white',
                                                                background: selectedSeats.length > 0 ? 'var(--rail-green)' : '#cbd5e1'
                                                            }}
                                                        >
                                                            {checkoutLoading ? <Spinner /> : 'PROCEED TO PAYMENT (LOCK 4 MIN)'}
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