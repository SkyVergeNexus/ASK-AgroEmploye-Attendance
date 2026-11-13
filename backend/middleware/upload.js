const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = 'emp_' + Date.now() + '_' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const ok = /jpeg|jpg|png|webp/.test(file.mimetype);
  cb(ok ? null : new Error('Only images allowed'), ok);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }
});
