import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "firebase/firestore";

// Paste your verified credentials from Firebase Console settings here
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Tracking items currently being written to the prescription form
let activeMedicines = [];

// ==========================================
// 1. FETCH & DISPLAY MEDICINE TAGS (LEFT SIDE)
// ==========================================
async function loadMedicineTags() {
    const container = document.getElementById("firebaseTagsContainer");
    try {
        const snapshot = await getDocs(collection(db, "medicines"));
        
        // Seeding database seamlessly if totally clean
        if (snapshot.empty) {
            const defaults = [
                "Paracetamol 500mg", "Amoxicillin 500mg", "Cetirizine 10mg", 
                "Metformin 500mg", "Pantoprazole 40mg", "Azithromycin 500mg", 
                "Ibuprofen 400mg", "Omeprazole 20mg", "Amlodipine 5mg"
            ];
            for (const medName of defaults) {
                await addDoc(collection(db, "medicines"), { name: medName });
            }
            loadMedicineTags(); // reload after injection
            return;
        }

        container.innerHTML = ""; // clean placeholder text
        snapshot.forEach(doc => {
            const medData = doc.data();
            const tagElement = document.createElement("div");
            tagElement.className = "med-tag";
            tagElement.textContent = medData.name;
            
            // Interaction: Clicking the tag appends it to active prescription list
            tagElement.addEventListener("click", () => addMedicineToForm(medData.name));
            container.appendChild(tagElement);
        });
    } catch (err) {
        console.error("Error reading tags collection: ", err);
        container.innerHTML = "<span style='color:red;'>Failed loading catalog.</span>";
    }
}

// ==========================================
// 2. DYNAMICALLY BUILD PRESCRIPTION FORM INTERACTION
// ==========================================
function addMedicineToForm(medicineName) {
    // Avoid putting the duplicate prescription entity item inside form
    if (activeMedicines.some(m => m.name === medicineName)) return;

    activeMedicines.push({ name: medicineName });
    renderActiveFormItems();
}

function renderActiveFormItems() {
    const targetDiv = document.getElementById("activePrescriptionMeds");
    const msg = document.getElementById("emptyFormMessage");

    if (activeMedicines.length === 0) {
        if (msg) msg.style.display = "block";
        targetDiv.innerHTML = "";
        targetDiv.appendChild(msg);
        return;
    }

    if (msg) msg.style.display = "none";
    
    // Clear out standard nodes preserving nothing except elements array states
    const items = document.querySelectorAll(".prescription-item");
    items.forEach(el => el.remove());

    activeMedicines.forEach((med, index) => {
        const row = document.createElement("div");
        row.className = "prescription-item";
        row.innerHTML = `
            <span class="item-name">${med.name}</span>
            <input type="text" class="item-input dosage-field" placeholder="Dosage (e.g., 1-0-1)" required value="${med.dosage || ''}">
            <input type="text" class="item-input duration-field" placeholder="Duration (e.g., 5 days)" required value="${med.duration || ''}">
            <button type="button" class="remove-btn">Remove</button>
        `;

        // Keep local state accurately bound on data entries typing changes
        row.querySelector(".dosage-field").addEventListener("input", (e) => activeMedicines[index].dosage = e.target.value);
        row.querySelector(".duration-field").addEventListener("input", (e) => activeMedicines[index].duration = e.target.value);
        
        row.querySelector(".remove-btn").addEventListener("click", () => {
            activeMedicines.splice(index, 1);
            renderActiveFormItems();
        });

        targetDiv.appendChild(row);
    });
}

// ==========================================
// 3. STORE COMPLETED LOG TO FIREBASE
// ==========================================
document.getElementById("savePrescriptionBtn").addEventListener("click", async () => {
    const patientName = document.getElementById("patientName").value.trim();
    const adviceText = document.getElementById("advice").value.trim();

    if (!patientName) {
        alert("Please specify a Patient Name.");
        return;
    }
    if (activeMedicines.length === 0) {
        alert("Please select medicines from the directory menu first.");
        return;
    }

    const receiptPayload = {
        patientName: patientName,
        advice: adviceText,
        medicines: activeMedicines,
        timestamp: new Date()
    };

    try {
        await addDoc(collection(db, "history"), receiptPayload);
        alert("Prescription submitted successfully to history log!");
        
        // Wipe local states layout forms to initial default
        document.getElementById("patientName").value = "";
        document.getElementById("advice").value = "";
        activeMedicines = [];
        renderActiveFormItems();
        
        // Re-pull updated timeline
        loadPrescriptionHistory();
    } catch (err) {
        console.error("Firestore Save Error: ", err);
    }
});

// ==========================================
// 4. FETCH HISTORY LOG RECORDS FROM FIRESTORE
// ==========================================
async function loadPrescriptionHistory() {
    const displayFeed = document.getElementById("historyFeed");
    try {
        const historyQuery = query(collection(db, "history"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(historyQuery);

        if (snapshot.empty) {
            displayFeed.innerHTML = "<p style='color:#777; font-size:13px;'>No past prescription history records tracked.</p>";
            return;
        }

        displayFeed.innerHTML = ""; // clean loading state
        snapshot.forEach(doc => {
            const data = doc.data();
            const dateStr = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString() : "Date Unknown";
            
            const card = document.createElement("div");
            card.className = "history-card";
            
            const medsList = data.medicines.map(m => `<li><strong>${m.name}</strong> — ${m.dosage || 'N/A'} (${m.duration || 'N/A'})</li>`).join("");

            card.innerHTML = `
                <strong style="color:#1a73e8; font-size:15px;">${data.patientName}</strong> 
                <span style="font-size:11px; color:#aaa; float:right;">${dateStr}</span>
                <ul class="history-meds">${medsList}</ul>
                ${data.advice ? `<p style="margin:5px 0 0 0; font-size:12px; color:#5f6368;"><strong>Advice:</strong> ${data.advice}</p>` : ""}
            `;
            displayFeed.appendChild(card);
        });
    } catch (err) {
        console.error("Firestore Read Error: ", err);
        displayFeed.innerHTML = "<p style='color:red;'>Run script locally via VS Code server and check security query indexes rules.</p>";
    }
}

// Global App Initialization Trigger
async function runEngine() {
    await loadMedicineTags();
    await loadPrescriptionHistory();
}
runEngine();
