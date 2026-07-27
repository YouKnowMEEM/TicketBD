const jwt = require('jsonwebtoken');

// Verifies the Bearer token on the request and attaches { userId, username, role } to req.user.
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ success: false, message: 'You must be logged in to do that.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Your session has expired. Please log in again.' });
        }
        req.user = payload;
        next();
    });
}

// Use after authenticateToken on routes like /api/user/:userId where the
// route param must match the logged-in user (unless they're an admin).
function authorizeSelfParam(req, res, next) {
    if (req.user.role === 'admin') return next();
    if (req.user.username !== req.params.userId) {
        return res.status(403).json({ success: false, message: "You can't access another user's data." });
    }
    next();
}

// Same idea, but for routes where the target user id is in the request body
// (e.g. /api/checkout, /api/cancel-ticket) rather than the URL.
function authorizeSelfBody(fieldName) {
    return (req, res, next) => {
        if (req.user.role === 'admin') return next();
        if (req.user.username !== req.body[fieldName]) {
            return res.status(403).json({ success: false, message: "You can't act on another user's behalf." });
        }
        next();
    };
}

module.exports = { authenticateToken, authorizeSelfParam, authorizeSelfBody };