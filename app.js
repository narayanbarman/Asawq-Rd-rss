// =========================================================================
// 1. FIREBASE CONFIGURATION (Replace with your actual keys from Settings)
// =========================================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase using global compat mapping
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Local array to keep track of medicines currently being added to the form
let activeMedicines = [];

// =========================================================================
// 2. FETCH & DISPLAY MEDICINE DIRECTORY TAGS (LEFT SIDE)
// =========================================================================
async function loadMedicineTags() {
    const container = document.getElementById("firebaseTagsContainer");
    if (!container) return;

    try {
        const snapshot = await db.collection("medicines").get();
        
        // AUTOMATIC SEEDING: If database is empty, seed initial tags automatically
        if (snapshot.empty) {
            console.log("Medicines collection empty! Seeding baseline templates...");
            const defaultMeds = [
                "Paracetamol 500mg", "Amoxicillin 500mg", "Cetirizine 10mg", 
                "Metformin 500mg", "Pantoprazole 40mg", "Azithromycin 500mg", 
                "Ibuprofen 400mg", "Omeprazole 20mg", "Amlodipine 5mg"
            ];
            
            for (const medName of defaultMeds) {
                await db.collection("medicines").add({ name: medName });
            }
            await loadMedicineTags();
            return;
        }

        container.innerHTML = ""; // Clear loading message
        
        snapshot.forEach(doc => {
            const medData = doc.data();
            const tagElement = document.createElement("div");
            tagElement.className = "med-tag";
            tagElement.textContent = medData.name;
            
            tagElement.addEventListener("click", () => addMedicineToForm(medData.name));
            container.appendChild(tagElement);
        });
    } catch (err) {
        console.error("Error fetching medicine tags: ", err);
        container.innerHTML = `<span style='color:red;'>Fetch Error: ${err.message}</span>`;
    }
}

// =========================================================================
// 3. PRESCRIPTION LIVE COMPILER LOGIC
// =========================================================================
function addMedicineToForm(medicineName) {
    if (activeMedicines.some(m => m.name === medicineName)) return;

    activeMedicines.push({ name: medicineName, dosage: "", duration: "" });
    renderActiveFormItems();
}

function renderActiveFormItems() {
    const targetDiv = document.getElementById("activePrescriptionMeds");
    const msg = document.getElementById("emptyFormMessage");
    if (!targetDiv) return;

    const existingRows = targetDiv.querySelectorAll(".prescription-item");
    existingRows.forEach(el => el.remove());

    if (activeMedicines.length === 0) {
        if (msg) msg.style.display = "block";
        return;
    }

    if (msg) msg.style.display = "none";

    activeMedicines.forEach((med, index) => {
        const row = document.createElement("div");
        row.className = "prescription-item";
        row.innerHTML = `
            <span class="item-name">${med.name}</span>
            <input type="text" class="item-input dosage-field" placeholder="Dosage (e.g., 1-0-1)" required value="${med.dosage}">
            <input type="text" class="item-input duration-field" placeholder="Duration (e.g., 5 days)" required value="${med.duration}">
            <button type="button" class="remove-btn">×</button>
        `;

        row.querySelector(".dosage-field").addEventListener("input", (e) => activeMedicines[index].dosage = e.target.value);
        row.querySelector(".duration-field").addEventListener("input", (e) => activeMedicines[index].duration = e.target.value);
        
        row.querySelector(".remove-btn").addEventListener("click", () => {
            activeMedicines.splice(index, 1);
            renderActiveFormItems();
        });

        targetDiv.appendChild(row);
    });
}

// =========================================================================
// 4. AUTOMATED SAVE FUNCTION (WRITES TO HISTORY)
// =========================================================================
document.getElementById("savePrescriptionBtn").addEventListener("click", async () => {
    const patientName = document.getElementById("patientName").value.trim();
    const adviceText = document.getElementById("advice").value.trim();

    if (!patientName) {
        alert("Please enter a valid Patient Name.");
        return;
    }
    if (activeMedicines.length === 0) {
        alert("Please select at least one medicine from the directory first.");
        return;
    }

    const prescriptionPayload = {
        patientName: patientName,
        advice: adviceText,
        medicines: activeMedicines,
        timestamp: new Date()
    };

    try {
        await db.collection("history").add(prescriptionPayload);
        alert("Prescription saved to Firestore successfully!");
        
        document.getElementById("patientName").value = "";
        document.getElementById("advice").value = "";
        activeMedicines = [];
        renderActiveFormItems();
        
        await loadPrescriptionHistory();
    } catch (err) {
        console.error("Firestore Save Error: ", err);
        alert("Could not save to database. Error message: " + err.message);
    }
});

// =========================================================================
// 5. AUTOMATED FETCH FUNCTION (READS HISTORY LOG DATA)
// =========================================================================
async function loadPrescriptionHistory() {
    const displayFeed = document.getElementById("historyFeed");
    if (!displayFeed) return;

    try {
        const snapshot = await db.collection("history").get();

        if (snapshot.empty) {
            displayFeed.innerHTML = "<p style='color:#777; font-size:13px;'>No past prescription history records tracked.</p>";
            return;
        }

        displayFeed.innerHTML = ""; 
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            let dateStr = "Date Unknown";
            if (data.timestamp) {
                const dateObj = data.timestamp.seconds ? new Date(data.timestamp.seconds * 1000) : new Date(data.timestamp);
                dateStr = dateObj.toLocaleString();
            }
            
            const card = document.createElement("div");
            card.className = "history-card";
            
            const medsListHtml = data.medicines.map(m => `
                <li><strong>${m.name}</strong> — ${m.dosage || 'N/A'} (${m.duration || 'N/A'})</li>
            `).join("");

            card.innerHTML = `
                <strong style="color:#1a73e8; font-size:15px;">${data.patientName}</strong> 
                <span style="font-size:11px; color:#aaa; float:right;">${dateStr}</span>
                <ul class="history-meds">${medsListHtml}</ul>
                ${data.advice ? `<p style="margin:5px 0 0 0; font-size:12px; color:#5f6368;"><strong>Advice:</strong> ${data.advice}</p>` : ""}
            `;
            displayFeed.appendChild(card);
        });
    } catch (err) {
        console.error("Firestore Fetch History Error: ", err);
        displayFeed.innerHTML = `<p style='color:red;'>Fetch failed: ${err.message}</p>`;
    }
}

// =========================================================================
// 6. MASTER INITIALIZATION ENGINE ON LOAD
// =========================================================================
async function runEngine() {
    console.log("Initializing Prescription Engine Stream...");
    await loadMedicineTags();
    await loadPrescriptionHistory();
}
runEngine();
