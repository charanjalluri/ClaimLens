const multer = require('multer');

// Configure in-memory storage so we can forward raw buffers to AI service and save to disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const field = file.fieldname;
  const mime = file.mimetype;

  if (field === 'image') {
    if (mime.startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new Error('Invalid image file type. Supported formats: JPG, PNG, WEBP, JPEG.'), false);
  }

  if (field === 'audio') {
    if (mime.startsWith('audio/') || mime === 'application/octet-stream' || mime.includes('mp3') || mime.includes('wav') || mime.includes('m4a') || mime.includes('ogg')) {
      return cb(null, true);
    }
    return cb(new Error('Invalid audio file type. Supported formats: MP3, WAV, M4A, OGG.'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB max per file
    files: 5,
  },
  fileFilter,
});

const claimUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

module.exports = {
  claimUpload,
};
