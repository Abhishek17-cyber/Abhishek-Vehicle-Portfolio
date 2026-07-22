/**
 * routes/ocr.js — Optical Character Recognition API
 * Uses Tesseract.js to extract data from uploaded vehicle documents (RC/Insurance).
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// Use memory storage for OCR (we don't need to save the file permanently just for extraction)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Helper function to extract vehicle details from raw OCR text
function parseVehicleData(text) {
  const data = {
    vehicleNumber: '',
    make: '',
    model: '',
    issueDate: '',
    expiryDate: ''
  };

  // 1. Vehicle Number regex (Indian formats: MH12AB1234, MH-12-AB-1234, MH 12 AB 1234)
  const plateRegex = /([A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4})/i;
  const plateMatch = text.match(plateRegex);
  if (plateMatch) {
    data.vehicleNumber = plateMatch[1].replace(/[-\s]/g, '').toUpperCase();
  }

  // 2. Make/Brand matching
  const makes = ['TATA', 'ASHOK LEYLAND', 'MAHINDRA', 'EICHER', 'BHARATBENZ', 'VOLVO', 'SCANIA'];
  const upperText = text.toUpperCase();
  for (const make of makes) {
    if (upperText.includes(make)) {
      data.make = make;
      break;
    }
  }

  // 3. Date extraction (DD/MM/YYYY or DD-MM-YYYY)
  const dateRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/g;
  const dates = [];
  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    dates.push(match[1]);
  }

  // If we found dates, assume the earliest is issue date and latest is expiry date
  if (dates.length > 0) {
    // Sort dates by actual time
    const parsedDates = dates.map(d => {
      const parts = d.split(/[\/\-]/);
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }).sort((a, b) => a - b);

    if (parsedDates.length >= 1) {
      // Format back to YYYY-MM-DD for HTML input[type="date"]
      data.issueDate = parsedDates[0].toISOString().split('T')[0];
    }
    if (parsedDates.length >= 2) {
      data.expiryDate = parsedDates[parsedDates.length - 1].toISOString().split('T')[0];
    }
  }

  return data;
}

// ===== POST /api/ocr/extract-vehicle =====
router.post('/extract-vehicle', upload.array('documents', 5), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded' });
  }

  try {
    const worker = await Tesseract.createWorker('eng');
    let combinedText = '';

    for (const file of req.files) {
      // Recognize text from each memory buffer
      const { data: { text } } = await worker.recognize(file.buffer);
      combinedText += text + '\n\n';
    }
    
    await worker.terminate();

    const extractedData = parseVehicleData(combinedText);

    return res.json({
      message: 'OCR Extraction Successful',
      rawText: combinedText.substring(0, 500) + '...', // send a snippet for debugging if needed
      extracted: extractedData
    });
  } catch (err) {
    console.error('OCR Error:', err);
    return res.status(500).json({ message: 'Failed to process documents using AI' });
  }
});

module.exports = router;
