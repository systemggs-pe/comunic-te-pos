import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyBLosM4ocr9OBLcpcRUc5QF3k8eVc4h5mA',
  authDomain: 'comunicate-tacna.firebaseapp.com',
  projectId: 'comunicate-tacna',
  storageBucket: 'comunicate-tacna.firebasestorage.app',
  messagingSenderId: '769900776082',
  appId: '1:769900776082:web:2ab9cf77e2ac793fe2344b',
  measurementId: 'G-KNYEG7V0KW',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const appId = 'comunicate-pos';

