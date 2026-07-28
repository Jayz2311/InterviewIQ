import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), '.interview-data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'interviews.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Initialize storage file if it doesn't exist
if (!fs.existsSync(STORAGE_FILE)) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify({}), 'utf8');
}

export function saveInterviewData(token, data) {
  try {
    const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    storage[token] = {
      ...data,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2), 'utf8');
    console.log('💾 Saved interview data to file for token:', token);
    
    // Also keep in memory for faster access
    global.interviewStore = global.interviewStore || {};
    global.interviewStore[token] = data;
  } catch (error) {
    console.error('❌ Error saving interview data:', error);
  }
}

export function getInterviewData(token) {
  try {
    // Try memory first
    if (global.interviewStore && global.interviewStore[token]) {
      console.log('✅ Found interview data in memory for token:', token);
      return global.interviewStore[token];
    }
    
    // Fall back to file storage
    const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    if (storage[token]) {
      console.log('✅ Found interview data in file storage for token:', token);
      // Load back into memory
      global.interviewStore = global.interviewStore || {};
      global.interviewStore[token] = storage[token];
      return storage[token];
    }
    
    console.warn('⚠️ No interview data found for token:', token);
    return null;
  } catch (error) {
    console.error('❌ Error reading interview data:', error);
    return null;
  }
}

export function deleteInterviewData(token) {
  try {
    const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    delete storage[token];
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2), 'utf8');
    
    if (global.interviewStore) {
      delete global.interviewStore[token];
    }
    
    console.log('🗑️ Deleted interview data for token:', token);
  } catch (error) {
    console.error('❌ Error deleting interview data:', error);
  }
}

export function getAllInterviews() {
  try {
    const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    return storage;
  } catch (error) {
    console.error('❌ Error reading all interviews:', error);
    return {};
  }
}

