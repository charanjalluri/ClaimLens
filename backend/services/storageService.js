const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Ensure upload subdirectories exist
const imagesDir = path.join(config.uploadDir, 'images');
const audioDir = path.join(config.uploadDir, 'audio');

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

const storageService = {
  getImagesDir() {
    return imagesDir;
  },

  getAudioDir() {
    return audioDir;
  },

  /**
   * Save an uploaded file or buffer to the image store.
   */
  saveImage(fileOrBuffer, originalName = 'image.jpg') {
    const ext = path.extname(originalName) || '.jpg';
    const filename = `img_${Date.now()}_${uuidv4().substring(0, 8)}${ext}`;
    const targetPath = path.join(imagesDir, filename);

    if (Buffer.isBuffer(fileOrBuffer)) {
      fs.writeFileSync(targetPath, fileOrBuffer);
    } else if (fileOrBuffer && fileOrBuffer.buffer) {
      fs.writeFileSync(targetPath, fileOrBuffer.buffer);
    } else if (typeof fileOrBuffer === 'string' && fileOrBuffer.startsWith('data:')) {
      // Base64 data URL
      const base64Data = fileOrBuffer.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
    }

    return {
      filename,
      filePath: targetPath,
      url: `/uploads/images/${filename}`,
    };
  },

  /**
   * Save an uploaded file or buffer to the audio store.
   */
  saveAudio(fileOrBuffer, originalName = 'audio.mp3') {
    const ext = path.extname(originalName) || '.mp3';
    const filename = `aud_${Date.now()}_${uuidv4().substring(0, 8)}${ext}`;
    const targetPath = path.join(audioDir, filename);

    if (Buffer.isBuffer(fileOrBuffer)) {
      fs.writeFileSync(targetPath, fileOrBuffer);
    } else if (fileOrBuffer && fileOrBuffer.buffer) {
      fs.writeFileSync(targetPath, fileOrBuffer.buffer);
    } else if (typeof fileOrBuffer === 'string' && fileOrBuffer.startsWith('data:')) {
      // Base64 data URL
      const base64Data = fileOrBuffer.replace(/^data:audio\/\w+;base64,/, '');
      fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
    }

    return {
      filename,
      filePath: targetPath,
      url: `/uploads/audio/${filename}`,
    };
  },
};

module.exports = storageService;
