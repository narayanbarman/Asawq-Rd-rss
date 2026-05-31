// Import Firebase SDK modules via CDN for browser compatibility
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your exact web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDCiuoqMR5UUJjK55MccquDyCuOxITBwzM",
  authDomain: "prescription-2ac05.firebaseapp.com",
  projectId: "prescription-2ac05",
  storageBucket: "prescription-2ac05.firebasestorage.app",
  messagingSenderId: "562970824094",
  appId: "1:562970824094:web:694e101a9549d4f20dda8f",
  measurementId: "G-ZCKP7WW7EC"
};

// Initialize Firebase App and Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// App Memory Cache for Fast Clicks
let currentUser = null;
const medicineTemplates = [
    "Paracetamol 650mg — [1-0-1] — After Food (5 Days)",
    "Amoxicillin 500mg — [1-1-1] — After Food (7 Days)",
    "Pantoprazole 40mg — [1-0-0] — Empty Stomach (10 Days)",
    "Cetirizine 10mg — [0-0-1] — At Bedtime (5 Days)",
    "Cough Syrup 10ml — [1-1-1] — Throat Soother (3 Days)"
];

// UI DOM targets
const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const docName = document.getElementById("doc-name");
const docEmail = document.getElementById("doc-email");
const templateContainer = document.getElementById("template-container");
const rxInput = document.getElementById("prescription-text");
const savePrintBtn = document.getElementById("save-print-btn");

// Handle User Authentication State Tracking
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        authScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");
        docName.textContent = user.displayName;
        docEmail.textContent = user.email;

        // Save or update doctor records in database silently
        await setDoc(doc(db, "doctors", user.uid), {
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            lastLogin: new Date()
        }, { merge: true });

        loadFastClickTemplates();
    } else {
        currentUser = null;
        appScreen.classList.add("hidden");
        authScreen.className = "flex"; // Show standard login flex alignment layout
    }
});

// User Auth Trigger Listeners
loginBtn.addEventListener("click", () => signInWithPopup(auth, provider).catch(err => console.error(err)));
logoutBtn.addEventListener("click", () => signOut(auth));

// Build Fast-Click Medicine Templates Local UI Elements
function loadFastClickTemplates() {
    templateContainer.innerHTML = "";
    medicineTemplates.forEach(med => {
        const span = document.createElement("span");
        span.className = "pill";
        span.textContent = med.split(" — ")[0]; 
        span.addEventListener("click", () => {
            const currentText = rxInput.value;
            rxInput.value = currentText ? `${currentText}\n• ${med}` : `• ${med}`;
        });
        templateContainer.appendChild(span);
    });
}

// Write Prescription Document data object into Firestore and trigger system UI Print
savePrintBtn.addEventListener("click", async () => {
    const pName = document.getElementById("patient-name").value.trim();
    const pAge = document.getElementById("patient-age").value.trim();
    const pSex = document.getElementById("patient-sex").value.trim();
    const rxText = rxInput.value.trim();

    if (!pName || !rxText) {
        alert("Please input Patient Name and Prescription Details!");
        return;
    }

    const docPayload = {
        doctorId: currentUser.uid,
        patientName: pName,
        patientAge: pAge,
        patientSex: pSex,
        prescription: rxText,
        timestamp: new Date()
    };

    try {
        await addDoc(collection(db, "prescriptions"), docPayload);
        
        document.getElementById("print-doc").textContent = currentUser.displayName;
        document.getElementById("print-date").textContent = new Date().toLocaleDateString();
        document.getElementById("print-p-name").textContent = pName;
        document.getElementById("print-p-meta").textContent = `${pAge} / ${pSex}`;
        document.getElementById("print-rx").textContent = rxText;

        const printArea = document.getElementById("print-area");
        printArea.classList.remove("hidden");
        
        window.print();
        
        document.getElementById("patient-name").value = "";
        document.getElementById("patient-age").value = "";
        document.getElementById("patient-sex").value = "";
        rxInput.value = "";
        printArea.classList.add("hidden");
        
    } catch (error) {
        console.error("Database Write Error: ", error);
        alert("Failed to securely save prescription data to server.");
    }
});
