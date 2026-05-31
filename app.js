import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "firebase/firestore";

// TODO: Replace with your actual Firebase project configurations
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global state tracking for medicines list fetched from Cloud Firestore
let cachedMedicinesList = [];

// 1. AUTOMATIC SEEDING: Check database for medicines; if empty, populate default ones
async function autoInitializeMedicines() {
    try {
        const medCollectionRef = collection(db, "medicines");
        const snapshot = await getDocs(medCollectionRef);
        
        // If no medicines exist in Firestore, seed it automatically
        if (snapshot.empty) {
            console.log("Medicines collection is empty. Seeding defaults automatically...");
            const defaultMedicines = [
                { name: "Paracetamol 500mg", type: "Tablet" },
                { name: "Amoxicillin 500mg", type: "Capsule" },
                { name: "Cetirizine 10mg", type: "Tablet" },
                { name: "Metformin 500mg", type: "Tablet" },
                { name: "Pantoprazole 40mg", type: "Tablet" },
                { name: "Azithromycin 500mg", type: "Tablet" },
                { name: "Ibuprofen 400mg", type: "Tablet" },
                { name: "Cough Syrup (Dextromethorphan)", type: "Syrup" }
            ];

            for (const med of defaultMedicines) {
                await addDoc(medCollectionRef, med);
            }
            console.log("Baseline medicines seeded successfully.");
            // Re-fetch now that database is populated
            await fetchMedicinesList();
        } else {
            // Read what is inside Firebase database
            cachedMedicinesList = [];
            snapshot.forEach(doc => {
                cachedMedicinesList.push(doc.data().name);
            });
            console.log("Loaded existing medicines from database:", cachedMedicinesList);
        }
        
        // Always generate a starting primary medicine field row on screen
        createMedicineRow();
    } catch (error) {
        console.error("Error setting up dynamic medicines database: ", error);
    }
}

// Helper to pull current medicine lists from Firebase
async function fetchMedicinesList() {
    const medCollectionRef = collection(db, "medicines");
    const snapshot = await getDocs(medCollectionRef);
    cachedMedicinesList = [];
    snapshot.forEach(doc => {
        cachedMedicinesList.push(doc.data().name);
    });
}

// 2. DYNAMIC FORM UI: Add rows for choosing medicines dynamically
const medicinesContainer = document.getElementById("medicinesContainer");

function createMedicineRow() {
    const rowId = 'med-row-' + Date.now();
    const row = document.createElement("div");
    row.className = "med-row";
    row.id = rowId;

    // Build selectable dropdown list populated with our dynamic Firebase medicines list
    let optionsHtml = `<option value="">-- Choose/Type Medicine --</option>`;
    cachedMedicinesList.sort().forEach(medName => {
        optionsHtml += `<option value="${medName}">${medName}</option>`;
    });

    row.innerHTML = `
        <select class="med-name-select" required style="flex: 2;">
            ${optionsHtml}
        </select>
        <input type="text" class="med-dosage" placeholder="e.g. 1-0-1" style="flex: 1;" required>
        <input type="text" class="med-duration" placeholder="e.g. 5 Days" style="flex: 1;" required>
        <button type="button" style="background-color:#dc3545;" onclick="document.getElementById('${rowId}').remove()">X</button>
    `;
    medicinesContainer.appendChild(row);
}

document.getElementById("addMedRowBtn").addEventListener("click", createMedicineRow);

// 3. AUTOMATED SAVE FUNCTION: Extracts form state and posts it into Firebase history collection
document.getElementById("savePrescriptionBtn").addEventListener("click", async () => {
    const patientName = document.getElementById("patientName").value.trim();
    const adviceText = document.getElementById("advice").value.trim();
    const tagsInput = document.getElementById("tags").value.trim();

    if (!patientName) {
        alert("Please enter a patient name.");
        return;
    }

    // Capture array of dynamically input medicines
    const selectedMedicines = [];
    const rows = document.querySelectorAll(".med-row");
    rows.forEach(row => {
        const name = row.querySelector(".med-name-select").value;
        const dosage = row.querySelector(".med-dosage").value.trim();
        const duration = row.querySelector(".med-duration").value.trim();
        
        if (name) {
            selectedMedicines.push({ name, dosage, duration });
        }
    });

    if (selectedMedicines.length === 0) {
        alert("Please select at least one medicine before saving.");
        return;
    }

    // Parse comma-separated text into real arrays for data architecture filtering
    const tagsArray = tagsInput ? tagsInput.split(",").map(t => t.trim()).filter(t => t !== "") : [];

    // Bundle the full payload data structure
    const payload = {
        patientName: patientName,
        medicines: selectedMedicines,
        advice: adviceText,
        tags: tagsArray,
        timestamp: new Date() // Sets current timestamp automatically
    };

    try {
        // Automatically creates 'history' collection if it doesn't exist and appends with Auto-Generated ID
        await addDoc(collection(db, "history"), payload);
        alert("Prescription history saved automatically!");
        
        // Reset inputs cleanly
        document.getElementById("patientName").value = "";
        document.getElementById("advice").value = "";
        document.getElementById("tags").value = "";
        medicinesContainer.innerHTML = "";
        createMedicineRow(); // Reset to 1 fresh medicine select row
        
        // Refresh and fetch updated histories right away
        await fetchAndRenderHistory();
    } catch (error) {
        console.error("Critical error while writing log: ", error);
        alert("Error saving data. Please check your Firestore security rules configuration.");
    }
});

// 4. AUTOMATED FETCH FUNCTION: Reads history tracking records from Firebase on demand
async function fetchAndRenderHistory() {
    const historyListContainer = document.getElementById("historyList");
    
    try {
        const historyQuery = query(collection(db, "history"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(historyQuery);
        
        if (snapshot.empty) {
            historyListContainer.innerHTML = "<p style='color: #777;'>No prescription history logs found.</p>";
            return;
        }

        historyListContainer.innerHTML = ""; // Wipe loading display message text
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const dateFormatted = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString() : "Unknown Date";

            // Map sub-arrays for items inside prescription safely
            const medsListHtml = data.medicines.map(m => `<li><strong>${m.name}</strong> - ${m.dosage} (${m.duration})</li>`).join("");
            const tagsHtml = data.tags ? data.tags.map(t => `<span class="tag">${t}</span>`).join("") : "";

            const card = document.createElement("div");
            card.className = "history-card";
            card.innerHTML = `
                <div style="font-size: 11px; color:#888; float:right;">ID: ${doc.id}</div>
                <h4 style="margin: 0 0 5px 0; color:#0056b3;">${data.patientName}</h4>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">${dateFormatted}</div>
                <ul style="margin: 5px 0; padding-left: 20px; font-size: 13px;">${medsListHtml}</ul>
                ${data.advice ? `<p style="font-size: 13px; margin: 5px 0;"><strong>Advice:</strong> ${data.advice}</p>` : ""}
                <div style="margin-top:8px;">${tagsHtml}</div>
            `;
            historyListContainer.appendChild(card);
        });

    } catch (error) {
        console.error("Error reading data logs stream: ", error);
        historyListContainer.innerHTML = "<p style='color: red;'>Error reading logs. See developer console.</p>";
    }
}

// EXECUTE APP SCRIPTS ON START
async function initializeAppEngine() {
    await autoInitializeMedicines();
    await fetchAndRenderHistory();
}
initializeAppEngine();
