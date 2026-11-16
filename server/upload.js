// Képfeltöltés (multer): felhasználónként külön mappába, csak képek, max. 8 MB
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./db');
const { HttpError } = require('./util');

const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const userDir = (userId) => {
  const dir = path.join(DATA_DIR, 'uploads', String(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const fileFilter = (req, file, cb) => (TYPES[file.mimetype] ? cb(null, true) : cb(new HttpError(400, 'Csak JPG, PNG, WEBP vagy GIF kép tölthető fel')));

// Lemezre mentés (edzésfotók)
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, userDir(req.userId)),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + TYPES[file.mimetype]),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter,
});

// Memóriában tartás (alapanyag-felismerés: csak elemezzük, nem tároljuk)
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

function removeUpload(userId, filename) {
  if (!filename) return;
  const file = path.join(userDir(userId), path.basename(filename));
  fs.rmSync(file, { force: true });
}

module.exports = { diskUpload, memoryUpload, userDir, removeUpload };
