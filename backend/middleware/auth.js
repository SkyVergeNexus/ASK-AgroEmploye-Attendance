const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ message: 'Invalid token' });
  }
};

exports.isAdmin = (req, res, next) => {
  if (req.user.system_role !== 'admin')
    return res.status(403).json({ message: 'Admin access required' });
  next();
};
