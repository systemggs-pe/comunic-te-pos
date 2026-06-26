import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyAHMYkEpa1NMvUiQA7wXBV3pTGY0aMhICE',
  authDomain: 'comunicate-aafcd.firebaseapp.com',
  projectId: 'comunicate-aafcd',
  storageBucket: 'comunicate-aafcd.firebasestorage.app',
  messagingSenderId: '362502368262',
  appId: ':362502368262:web:cb928ec9d43957a448e787',
  //measurementId: 'G-KNYEG7V0KW',"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const appId = 'comunicate-pos';

