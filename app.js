// Import Firebase SDK modules via CDN for browser compatibility
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// App Memory Cache
let currentUser = null;
let medicines = [];
let adviceTags = [];
let prescriptions = [];
let userFreqTags = [];
let userDurTags = [];
let userHowTags = [];

// Fallback Default Master Configurations
const DEFAULT_MEDS = [
  { id: "m1", name: "Paracetamol", dosage: "500mg", frequency: "1-1-1", duration: "5 days", howToTake: "After meals", usageCount: 12, pinned: false },
  { id: "m2", name: "Amoxicillin", dosage: "250mg", frequency: "BD", duration: "7 days", howToTake: "Empty stomach", usageCount: 8, pinned: false },
  { id: "m3", name: "Azithromycin", dosage: "500mg", frequency: "OD", duration: "3 days", howToTake: "Empty stomach", usageCount: 15, pinned: false },
  { id: "m4", name: "Losartan", dosage: "50mg", frequency: "OD", duration: "30 days", howToTake: "Morning", usageCount: 5, pinned: false },
  { id: "m5", name: "Cetirizine", dosage: "10mg", frequency: "HS", duration: "5 days", howToTake: "Night", usageCount: 7, pinned: false }
];
const DEFAULT_ADVICE = ["Take plenty of fluids", "Avoid driving", "Review after 3 days", "Strict bed rest"];
const DEFAULT_FREQ = ["1-1-1","1-0-0","0-1-0","0-0-1","BD","TID","OD"];
const DEFAULT_DUR = ["3 days","5 days","7 days","10 days","14 days","30 days"];
const DEFAULT_HOW = ["After meals","Empty stomach","With water","At bedtime"];

let currentMedicines = [], currentAdvices = [], currentSerial = "", pendingMedicine = null, currentTagType = "";

// Auth Target Handlers
const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const doctorProfileBadge = document.getElementById("doctor-profile-badge");

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    doctorProfileBadge.textContent = `Dr. ${user.displayName} (${user.email})`;
    
    // Initialise and fetch personal datasets from Firebase Cloud
    await syncUserDataFromCloud();
    initWorkspace();
  } else {
    currentUser = null;
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
});

loginBtn.addEventListener("click", () => signInWithPopup(auth, provider).catch(err => console.error(err)));
logoutBtn.addEventListener("click", () => signOut(auth));

// Synchronise Datasets per Doctor UID
async function syncUserDataFromCloud() {
  const docRef = doc(db, "doctor_settings", currentUser.uid);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      medicines = data.medicines || DEFAULT_MEDS;
      adviceTags = data.adviceTags || DEFAULT_ADVICE;
      userFreqTags = data.userFreqTags || DEFAULT_FREQ;
      userDurTags = data.userDurTags || DEFAULT_DUR;
      userHowTags = data.userHowTags || DEFAULT_HOW;
    } else {
      // First time sign-in: build custom layout container with default templates
      medicines = DEFAULT_MEDS;
      adviceTags = DEFAULT_ADVICE;
      userFreqTags = DEFAULT_FREQ;
      userDurTags = DEFAULT_DUR;
      userHowTags = DEFAULT_HOW;
      await saveUserSettingsToCloud();
    }
    
    // Fetch prescription entries recorded under current doctor account
    const q = query(collection(db, "prescriptions"), where("doctorId", "==", currentUser.uid), orderBy("timestamp", "desc"));
    const querySnap = await getDocs(q);
    prescriptions = [];
    querySnap.forEach((doc) => {
      const pData = doc.data();
      prescriptions.push({
        id: doc.id,
        serial: pData.serial,
        dateTime: pData.timestamp ? pData.timestamp.toDate().toISOString() : new Date().toISOString(),
        patient: pData.patient,
        diagnosis: pData.diagnosis,
        medicines: pData.medicines,
        advices: pData.advices
      });
    });
  } catch (err) {
    console.error("Cloud data fetch error, fallback to local storage:", err);
  }
}

async function saveUserSettingsToCloud() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "doctor_settings", currentUser.uid), {
      medicines,
      adviceTags,
      userFreqTags,
      userDurTags,
      userHowTags
    }, { merge: true });
  } catch (e) {
    console.error("Error updating user cloud parameters: ", e);
  }
}

function generateSerial() { 
  if(prescriptions.length === 0) return "RX001"; 
  let max = 0; 
  prescriptions.forEach(p => {
    let m = p.serial.match(/\d+/); 
    if(m) max = Math.max(max, parseInt(m[0]));
  }); 
  return `RX${(max + 1).toString().padStart(3, '0')}`; 
}

function renderMedicineList(search="") {
  let filtered = medicines.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  filtered.sort((a, b) => b.usageCount - a.usageCount);
  const container = document.getElementById("medicineListContainer");
  container.innerHTML = filtered.map(med => `
    <div class="med-item" data-med-id="${med.id}">
      <div><span class="med-name">${escapeHtml(med.name)}</span><div class="med-detail">${med.dosage}</div></div>
      <div class="pin-icon ${med.pinned ? 'pinned' : ''}" data-id="${med.id}"><i class="fas fa-star"></i></div>
    </div>
  `).join("");
  
  document.querySelectorAll("#medicineListContainer .med-item").forEach(el => {
    el.addEventListener("click", (e) => {
      if(e.target.closest('.pin-icon')) return;
      const medId = el.dataset.medId;
      const med = medicines.find(m => m.id === medId);
      if(med) openPopup(med);
    });
  });
  
  document.querySelectorAll("#medicineListContainer .pin-icon").forEach(el => el.addEventListener("click", async (e) => {
    e.stopPropagation(); 
    const id = el.dataset.id; 
    const med = medicines.find(m => m.id === id); 
    if(med) { 
      med.pinned = !med.pinned; 
      renderMedicineList(document.getElementById("searchMedicine").value); 
      renderPinnedSection(); 
      renderMostUsed(); 
      await saveUserSettingsToCloud();
    }
  }));
  renderPinnedSection();
}

function renderPinnedSection() {
  const pinned = medicines.filter(m => m.pinned === true);
  const container = document.getElementById("pinnedList");
  const section = document.getElementById("pinnedSection");
  if(pinned.length === 0) { section.style.display = "none"; return; }
  section.style.display = "block";
  container.innerHTML = pinned.map(med => `
    <div class="med-item" data-med-id="${med.id}">
      <div><span class="med-name">${escapeHtml(med.name)}</span><div class="med-detail">${med.dosage}</div></div>
      <div class="pin-icon pinned" data-id="${med.id}"><i class="fas fa-star"></i></div>
    </div>
  `).join("");
  
  document.querySelectorAll("#pinnedList .med-item").forEach(el => {
    el.addEventListener("click", (e) => {
      if(e.target.closest('.pin-icon')) return;
      const medId = el.dataset.medId;
      const med = medicines.find(m => m.id === medId);
      if(med) openPopup(med);
    });
  });
  
  document.querySelectorAll("#pinnedList .pin-icon").forEach(el => el.addEventListener("click", async (e) => {
    e.stopPropagation(); 
    const id = el.dataset.id; 
    const med = medicines.find(m => m.id === id); 
    if(med) { 
      med.pinned = false; 
      renderMedicineList(document.getElementById("searchMedicine").value); 
      renderPinnedSection(); 
      renderMostUsed(); 
      await saveUserSettingsToCloud();
    }
  }));
}

function renderMostUsed() {
  const sorted = [...medicines].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5);
  document.getElementById("mostUsedContainer").innerHTML = `<div style="display:flex; flex-wrap:wrap; gap:6px;">` + sorted.map(m => `<span style="background:#eef2ff; padding:3px 10px; border-radius:30px; cursor:pointer; font-size:0.7rem;" data-mid="${m.id}">🔥 ${m.name}</span>`).join("") + `</div>`;
  document.querySelectorAll("#mostUsedContainer span").forEach(span => span.addEventListener("click", () => {
    const med = medicines.find(m => m.id === span.dataset.mid); 
    if(med) openPopup(med);
  }));
}

function openPopup(med){
  pendingMedicine = med;
  document.getElementById("modalMedName").innerText = med.name;
  document.getElementById("modalDosage").value = med.dosage || "";
  document.getElementById("modalFrequency").value = med.frequency || "";
  document.getElementById("modalDuration").value = med.duration || "";
  document.getElementById("modalHowToTake").value = med.howToTake || "";
  renderTagGroup("freqTagsContainer", userFreqTags, "freq");
  renderTagGroup("durTagsContainer", userDurTags, "dur");
  renderTagGroup("howTagsContainer", userHowTags, "how");
  document.getElementById("medicineModal").style.display = "block";
}

function renderTagGroup(containerId, tags, type){
  const container = document.getElementById(containerId);
  container.innerHTML = tags.map(t => `<span class="tag" data-tag="${escapeHtml(t)}" data-type="${type}">${escapeHtml(t)}</span>`).join("");
  container.querySelectorAll(".tag").forEach(el => el.addEventListener("click", () => {
    if(type === "freq") document.getElementById("modalFrequency").value = el.dataset.tag;
    else if(type === "dur") document.getElementById("modalDuration").value = el.dataset.tag;
    else if(type === "how") document.getElementById("modalHowToTake").value = el.dataset.tag;
  }));
}

async function addMedicineFromPopup(){
  if(!pendingMedicine) return;
  const dosage = document.getElementById("modalDosage").value.trim() || "As directed";
  const frequency = document.getElementById("modalFrequency").value.trim() || "1-1-1";
  const duration = document.getElementById("modalDuration").value.trim() || "5 days";
  const howToTake = document.getElementById("modalHowToTake").value.trim() || "";
  currentMedicines.push({ name: pendingMedicine.name, dosage, frequency, duration, howToTake });
  
  const idx = medicines.findIndex(m => m.id === pendingMedicine.id);
  if(idx !== -1) { 
    medicines[idx].usageCount = (medicines[idx].usageCount || 0) + 1; 
    await saveUserSettingsToCloud();
  }
  renderMedicinesTable(); updatePreview(); closeModal();
  renderMedicineList(document.getElementById("searchMedicine").value); renderMostUsed(); renderPinnedSection();
}

function renderMedicinesTable(){ 
  const tbody = document.getElementById("medicinesTableBody"); 
  tbody.innerHTML = ""; 
  currentMedicines.forEach((item, idx) => { 
    let row = tbody.insertRow(); 
    row.insertCell(0).innerHTML = `<input value="${escapeHtml(item.name)}" class="med-field" data-idx="${idx}" data-field="name">`; 
    row.insertCell(1).innerHTML = `<input value="${escapeHtml(item.dosage)}" class="med-field" data-idx="${idx}" data-field="dosage">`; 
    row.insertCell(2).innerHTML = `<input value="${escapeHtml(item.frequency)}" class="med-field" data-idx="${idx}" data-field="frequency">`; 
    row.insertCell(3).innerHTML = `<input value="${escapeHtml(item.duration)}" class="med-field" data-idx="${idx}" data-field="duration">`; 
    row.insertCell(4).innerHTML = `<input value="${escapeHtml(item.howToTake)}" class="med-field" data-idx="${idx}" data-field="howToTake">`; 
    let del = document.createElement("button"); 
    del.innerHTML = '<i class="fas fa-trash"></i>'; 
    del.className = "btn-sm"; 
    del.onclick = () => { currentMedicines.splice(idx, 1); renderMedicinesTable(); updatePreview(); }; 
    row.insertCell(5).appendChild(del); 
  }); 
  document.querySelectorAll(".med-field").forEach(inp => inp.addEventListener("change", function(){
    let idx = parseInt(this.dataset.idx), field = this.dataset.field; 
    if(!isNaN(idx) && currentMedicines[idx]) { currentMedicines[idx][field] = this.value; updatePreview(); }
  })); 
}

function renderAdviceTags(){ 
  const container = document.getElementById("adviceTagList"); 
  container.innerHTML = adviceTags.map(t => `<span class="advice-tag" data-advice="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join(""); 
  document.querySelectorAll(".advice-tag").forEach(el => el.addEventListener("click", () => addAdvice(el.dataset.advice))); 
}

async function addAdvice(t){ 
  if(t.trim()){ 
    currentAdvices.push(t.trim()); 
    renderCurrentAdvices(); 
    updatePreview(); 
    if(!adviceTags.includes(t.trim())){ 
      adviceTags.push(t.trim()); 
      renderAdviceTags(); 
      await saveUserSettingsToCloud();
    } 
  } 
}

function renderCurrentAdvices(){ 
  const container = document.getElementById("currentAdvicesList"); 
  container.innerHTML = currentAdvices.map((adv, idx) => `<span style="background:#eef2ff; padding:3px 10px; border-radius:30px; display:inline-flex; align-items:center; gap:6px; font-size:0.7rem;">${escapeHtml(adv)} <i class="fas fa-times-circle" style="cursor:pointer; color:#dc2626;" data-adv-idx="${idx}"></i></span>`).join(""); 
  document.querySelectorAll("#currentAdvicesList i[data-adv-idx]").forEach(icon => icon.addEventListener("click", (e) => {
    const idx = parseInt(icon.dataset.advIdx); 
    currentAdvices.splice(idx, 1); 
    renderCurrentAdvices(); 
    updatePreview();
  })); 
}

function getPreviewHTML(split){ 
  const fn = document.getElementById("firstName").value.trim(), ln = document.getElementById("lastName").value.trim(), age = document.getElementById("patientAge").value.trim(), gender = document.getElementById("patientGender").value, diag = document.getElementById("diagnosisField").value.trim(); 
  let patient = (fn || ln) ? `${fn} ${ln}`.trim() : ""; 
  let genderShow = gender ? `(${gender})` : ""; 
  let patientLine = (patient || age || genderShow) ? `<div><strong>${patient || "Patient"}</strong> ${age ? `, Age: ${age}` : ''} ${genderShow}</div>` : ""; 
  let diagHtml = diag ? `<div><strong>Diagnosis:</strong> ${escapeHtml(diag)}</div>` : ""; 
  let medTable = `<table style="width:100%; border-collapse:collapse; margin-top:8px;"><thead><tr style="background:#f1f5f9;"><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>How to take</th></tr></thead><tbody>`; 
  currentMedicines.forEach(it => { medTable += `<tr><td>${escapeHtml(it.name)}</td><td>${it.dosage || "-"}</td><td>${it.frequency || "-"}</td><td>${it.duration || "-"}</td><td>${it.howToTake || "-"}</td></tr>`; }); 
  medTable += `</tbody></table>`; 
  if(currentMedicines.length === 0) medTable = "<p><i>No medicines added.</i></p>"; 
  const main = `<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between; font-size:0.8rem;"><span><strong>${currentSerial}</strong></span><span>${new Date().toLocaleString()}</span></div>${patientLine}${diagHtml}</div>${medTable}`; 
  if(split){ 
    let leftDisease = diag ? `<div style="margin-bottom:12px;"><strong>Disease:</strong><br>${escapeHtml(diag)}</div>` : ""; 
    let leftAdvice = currentAdvices.length ? `<div><strong>Advice:</strong><ul style="padding-left:16px;">${currentAdvices.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul></div>` : ""; 
    return `<div style="display:flex; gap:16px;"><div style="width:120px; border-right:1px solid #0a7e8c; padding-right:10px;">${leftDisease}${leftAdvice}</div><div style="flex:1;">${main}</div></div>`; 
  } else { 
    let adviceHtml = currentAdvices.length ? `<div style="margin-top:12px;"><strong>Advice:</strong><ul>${currentAdvices.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul></div>` : ""; 
    return main + adviceHtml; 
  } 
}

function updatePreview(){ 
  const split = document.querySelector('input[name="paperStyle"]:checked').value === "split"; 
  document.getElementById("livePreviewArea").innerHTML = getPreviewHTML(split); 
  const cont = document.getElementById("previewContainer"); 
  if(split) cont.classList.add("split-line"); else cont.classList.remove("split-line"); 
}

function resetCurrentDraft(){ 
  currentMedicines = []; currentAdvices = []; 
  document.getElementById("firstName").value = ""; 
  document.getElementById("lastName").value = ""; 
  document.getElementById("patientAge").value = ""; 
  document.getElementById("patientGender").value = ""; 
  document.getElementById("diagnosisField").value = ""; 
  renderMedicinesTable(); renderCurrentAdvices(); updatePreview(); 
  currentSerial = generateSerial(); 
}

async function saveCurrentPrescription(){ 
  if(currentMedicines.length === 0 && currentAdvices.length === 0) { alert("Add at least one medicine or advice."); return; } 
  
  const payload = {
    doctorId: currentUser.uid,
    serial: currentSerial,
    timestamp: new Date(),
    patient: {
      firstName: document.getElementById("firstName").value.trim(),
      lastName: document.getElementById("lastName").value.trim(),
      age: document.getElementById("patientAge").value.trim(),
      gender: document.getElementById("patientGender").value
    },
    diagnosis: document.getElementById("diagnosisField").value.trim(),
    medicines: currentMedicines,
    advices: currentAdvices
  };

  try {
    // Write structural snapshot straight into Cloud Firestore
    const ref = await addDoc(collection(db, "prescriptions"), payload);
    
    // Inject down locally to avoid a complete page network refresh
    prescriptions.unshift({
      id: ref.id,
      ...payload,
      dateTime: new Date().toISOString()
    });

    alert(`Saved ${currentSerial} safely to Cloud database.`);
    resetCurrentDraft();
  } catch (error) {
    console.error("Firebase Database Save Failure: ", error);
    alert("Cloud connection error. Failed to save document.");
  }
}

function showHistoryModal(){ renderHistoryList(); document.getElementById("historyModal").style.display = "block"; }

function renderHistoryList(){ 
  let filtered = [...prescriptions]; 
  const name = document.getElementById("historySearchName").value.trim().toLowerCase(); 
  const from = document.getElementById("historyFromDate").value; 
  const to = document.getElementById("historyToDate").value; 
  const year = document.getElementById("historyYear").value.trim(); 
  const month = document.getElementById("historyMonth").value; 
  if(name) filtered = filtered.filter(p => `${p.patient.firstName || ''} ${p.patient.lastName || ''}`.trim().toLowerCase().includes(name)); 
  if(from){ const f = new Date(from); f.setHours(0,0,0,0); filtered = filtered.filter(p => new Date(p.dateTime) >= f); } 
  if(to){ const t = new Date(to); t.setHours(23,59,59,999); filtered = filtered.filter(p => new Date(p.dateTime) <= t); } 
  if(year && !isNaN(parseInt(year))) filtered = filtered.filter(p => new Date(p.dateTime).getFullYear() === parseInt(year)); 
  if(month && month !== "") filtered = filtered.filter(p => (new Date(p.dateTime).getMonth() + 1) === parseInt(month)); 
  const container = document.getElementById("historyListContainer"); 
  if(filtered.length === 0){ container.innerHTML = "<div class='history-item'>No records found</div>"; return; } 
  container.innerHTML = filtered.map(p => `<div class="history-item" data-prescid="${p.id}"><div><strong>${p.serial}</strong> | ${`${p.patient.firstName || ''} ${p.patient.lastName || ''}`.trim() || "Anonymous"} | ${new Date(p.dateTime).toLocaleDateString()}</div><div><i class="fas fa-chevron-right"></i> Load</div></div>`).join(""); 
  document.querySelectorAll("#historyListContainer .history-item").forEach(el => el.addEventListener("click", () => {
    const presc = prescriptions.find(p => p.id === el.dataset.prescid); 
    if(presc){ loadPrescription(presc); document.getElementById("historyModal").style.display = "none"; }
  })); 
}

function loadPrescription(presc){ 
  currentSerial = presc.serial; 
  document.getElementById("firstName").value = presc.patient.firstName || ""; 
  document.getElementById("lastName").value = presc.patient.lastName || ""; 
  document.getElementById("patientAge").value = presc.patient.age || ""; 
  document.getElementById("patientGender").value = presc.patient.gender || ""; 
  document.getElementById("diagnosisField").value = presc.diagnosis || ""; 
  currentMedicines = JSON.parse(JSON.stringify(presc.medicines || [])); 
  currentAdvices = [...(presc.advices || [])]; 
  renderMedicinesTable(); renderCurrentAdvices(); updatePreview(); 
  document.querySelector(".right-panel").scrollIntoView({ behavior: "smooth" }); 
}

function resetHistoryFilters(){ document.getElementById("historySearchName").value = ""; document.getElementById("historyFromDate").value = ""; document.getElementById("historyToDate").value = ""; document.getElementById("historyYear").value = ""; document.getElementById("historyMonth").value = ""; renderHistoryList(); }
function openQuickPopup(){ document.getElementById("quickModal").style.display = "block"; }

async function addQuickMedicine(){ 
  let name = document.getElementById("quickName").value.trim(); 
  let dosage = document.getElementById("quickDosage").value.trim(); 
  if(!name){ alert("Enter medicine name"); return; } 
  if(!dosage) dosage = "As directed"; 
  currentMedicines.push({ name, dosage, frequency: "1-1-1", duration: "5 days", howToTake: "As directed" }); 
  
  if(!medicines.some(m => m.name.toLowerCase() === name.toLowerCase())){ 
    medicines.push({ id: "m" + Date.now(), name, dosage, frequency: "1-1-1", duration: "5 days", howToTake: "As directed", usageCount: 1, pinned: false }); 
    renderMedicineList(document.getElementById("searchMedicine").value); renderMostUsed(); renderPinnedSection(); 
    await saveUserSettingsToCloud();
  } else { 
    const ex = medicines.find(m => m.name.toLowerCase() === name.toLowerCase()); 
    if(ex){ ex.usageCount = (ex.usageCount || 0) + 1; await saveUserSettingsToCloud(); }
  } 
  renderMedicinesTable(); updatePreview(); 
  document.getElementById("quickModal").style.display = "none"; 
}

function closeModal(){ document.getElementById("medicineModal").style.display = "none"; pendingMedicine = null; }
function closeQuickPopup(){ document.getElementById("quickModal").style.display = "none"; }

function printWithMargin(){ 
  const split = document.querySelector('input[name="paperStyle"]:checked').value === "split"; 
  const margin = parseInt(document.getElementById("printTopMargin").value) || 0; 
  const html = getPreviewHTML(split); 
  const win = window.open('', '_blank'); 
  win.document.write(`<!DOCTYPE html><html><head><title>Prescription</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Inter',sans-serif; padding:${margin}mm 10mm 10mm 10mm; background:white;}.prescription-content{max-width:800px;margin:0 auto;}@media print{body{padding:${margin}mm 10mm 10mm 10mm;}}</style></head><body><div class="prescription-content">${html}</div><script>window.onload=function(){window.print();setTimeout(function(){window.close();},500)}<\/script></body></html>`); 
  win.document.close(); 
}

function setupSearchSuggestions(){ 
  const inp = document.getElementById("searchMedicine"); 
  const box = document.getElementById("suggestionsBox"); 
  inp.addEventListener("input", function(){ 
    const val = this.value.toLowerCase(); 
    if(val.length < 1){ box.style.display = "none"; return; } 
    const matches = medicines.filter(m => m.name.toLowerCase().includes(val)).slice(0, 6); 
    if(matches.length === 0){ box.style.display = "none"; return; } 
    box.innerHTML = matches.map(m => `<div data-name="${escapeHtml(m.name)}">${escapeHtml(m.name)} (${m.dosage})</div>`).join(""); 
    box.style.display = "block"; 
    box.querySelectorAll("div").forEach(div => div.addEventListener("click", () => { 
      const med = medicines.find(m => m.name === div.dataset.name); 
      if(med) openPopup(med); inp.value = ""; box.style.display = "none"; 
    })); 
  }); 
  document.addEventListener("click", (e) => { if(!inp.contains(e.target) && !box.contains(e.target)) box.style.display = "none"; }); 
}

function importMedicinesFromFile(file){ 
  const reader = new FileReader(); 
  reader.onload = async (e) => { 
    let content = e.target.result; 
    if(file.name.endsWith(".json")){ 
      try { let arr = JSON.parse(content); if(Array.isArray(arr)) await mergeMedicines(arr); } catch(e) { alert("Invalid JSON format"); } 
    } else if(file.name.endsWith(".csv")){ 
      let lines = content.split("\n"); let newMeds = []; 
      for(let i = 1; i < lines.length; i++){ 
        let vals = lines[i].split(","); 
        if(vals.length >= 2){ newMeds.push({ id: "m" + Date.now() + i, name: vals[0].trim(), dosage: vals[1] ? vals[1].trim() : "", frequency: vals[2] ? vals[2].trim() : "", duration: vals[3] ? vals[3].trim() : "", howToTake: vals[4] ? vals[4].trim() : "", usageCount: 0, pinned: false }); } 
      } 
      await mergeMedicines(newMeds); 
    } 
  }; 
  reader.readAsText(file); 
}

async function mergeMedicines(newMeds){ 
  newMeds.forEach(med => { if(med.name && !medicines.some(m => m.name.toLowerCase() === med.name.toLowerCase())) medicines.push({ ...med, id: med.id || "m" + Date.now() + Math.random() }); }); 
  renderMedicineList(document.getElementById("searchMedicine").value); renderMostUsed(); renderPinnedSection(); 
  await saveUserSettingsToCloud();
  alert("Import complete."); 
}

function showHelp(){ alert("💊 FAST PRESCRIPTION PORTAL CLOUD\n\n• Changes are synchronized instantly across all computers via secure account login.\n• Click any medicine card → access full configuration tags.\n• Star icons set your quick dashboard favorites."); }

function showAnalysis() { updateAnalysisDashboard(); document.getElementById("analysisModal").style.display = "block"; }

function updateAnalysisDashboard() {
  const from = document.getElementById("analysisFromDate").value;
  const to = document.getElementById("analysisToDate").value;
  let filtered = [...prescriptions];
  if(from) { const f = new Date(from); f.setHours(0,0,0,0); filtered = filtered.filter(p => new Date(p.dateTime) >= f); }
  if(to) { const t = new Date(to); t.setHours(23,59,59,999); filtered = filtered.filter(p => new Date(p.dateTime) <= t); }
  const total = filtered.length;
  const today = new Date().toDateString();
  const todayCount = filtered.filter(p => new Date(p.dateTime).toDateString() === today).length;
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekCount = filtered.filter(p => new Date(p.dateTime) >= weekAgo).length;
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const monthCount = filtered.filter(p => new Date(p.dateTime) >= monthAgo).length;
  const year = new Date().getFullYear();
  const yearCount = filtered.filter(p => new Date(p.dateTime).getFullYear() === year).length;
  document.getElementById("analysisCards").innerHTML = `
    <div class="analytics-card"><div class="number">${total}</div><div class="label">Total Prescriptions</div></div>
    <div class="analytics-card"><div class="number">${todayCount}</div><div class="label">Today</div></div>
    <div class="analytics-card"><div class="number">${weekCount}</div><div class="label">Last 7 days</div></div>
    <div class="analytics-card"><div class="number">${monthCount}</div><div class="label">Last 30 days</div></div>
    <div class="analytics-card"><div class="number">${yearCount}</div><div class="label">This year</div></div>
  `;
  
  let monthly = {};
  filtered.forEach(p => { const d = new Date(p.dateTime); const key = `${d.getFullYear()}-${d.getMonth() + 1}`; monthly[key] = (monthly[key] || 0) + 1; });
  const labels = Object.keys(monthly).sort();
  const data = labels.map(l => monthly[l]);
  const ctx = document.getElementById('monthlyChart').getContext('2d');
  if(window.monthlyChartInstance) window.monthlyChartInstance.destroy();
  window.monthlyChartInstance = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Prescriptions per month', data, backgroundColor: '#0a7e8c', borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } } });
  document.getElementById("analysisStats").innerHTML = filtered.length ? `<div class="stat-item"><strong>Period total:</strong> ${filtered.length} prescriptions</div>` : "";
}

function resetAnalysisFilters() { document.getElementById("analysisFromDate").value = ""; document.getElementById("analysisToDate").value = ""; updateAnalysisDashboard(); }

function openMedicineInventory() { renderSimpleInventory(); document.getElementById("medicineInventoryModal").style.display = "block"; }

function renderSimpleInventory() { 
  const tbody = document.getElementById("inventoryMedBody"); 
  tbody.innerHTML = ""; 
  medicines.forEach((med, idx) => { 
    let row = tbody.insertRow(); 
    row.insertCell(0).innerHTML = `<input type="text" value="${escapeHtml(med.name)}" class="inv-name" data-idx="${idx}">`; 
    row.insertCell(1).innerHTML = `<input type="text" value="${escapeHtml(med.dosage)}" class="inv-dosage" data-idx="${idx}">`; 
    let delBtn = document.createElement("button"); 
    delBtn.innerHTML = '<i class="fas fa-trash"></i>'; 
    delBtn.className = "btn-sm btn-danger"; 
    delBtn.onclick = async () => { 
      medicines.splice(idx, 1); 
      renderSimpleInventory(); 
      renderMedicineList(document.getElementById("searchMedicine").value); renderMostUsed(); renderPinnedSection(); 
      await saveUserSettingsToCloud();
    }; 
    row.insertCell(2).appendChild(delBtn); 
  }); 
  document.querySelectorAll(".inv-name, .inv-dosage").forEach(inp => inp.addEventListener("change", async function(){ 
    let idx = parseInt(this.dataset.idx); 
    if(!isNaN(idx) && medicines[idx]){ 
      if(this.classList.contains("inv-name")) medicines[idx].name = this.value; else medicines[idx].dosage = this.value; 
      renderMedicineList(document.getElementById("searchMedicine").value); renderMostUsed(); renderPinnedSection(); 
      await saveUserSettingsToCloud();
    }
  })); 
}

async function addInventoryMedicine() { 
  let name = prompt("Medicine name:"); if(!name) return; 
  let dosage = prompt("Dosage:"); if(!dosage) dosage = "As directed"; 
  medicines.push({ id: "m" + Date.now(), name, dosage, frequency: "1-1-1", duration: "5 days", howToTake: "", usageCount: 0, pinned: false }); 
  renderSimpleInventory(); 
  renderMedicineList(document.getElementById("searchMedicine").value); renderMostUsed(); renderPinnedSection(); 
  await saveUserSettingsToCloud();
}

async function deleteAllMedicines(){ 
  if(confirm("Delete ALL medicines from cloud?")){ 
    medicines = []; 
    renderSimpleInventory(); renderMedicineList(""); renderMostUsed(); renderPinnedSection(); 
    await saveUserSettingsToCloud();
  } 
}

function openAdviceInventory(){ renderAdviceInventory(); document.getElementById("adviceInventoryModal").style.display = "block"; }

function renderAdviceInventory(){ 
  const container = document.getElementById("adviceInventoryList"); 
  container.innerHTML = ""; 
  adviceTags.forEach((tag, idx) => { 
    const div = document.createElement("div"); 
    div.style.display = "flex"; div.style.alignItems = "center"; div.style.gap = "8px"; div.style.marginBottom = "8px"; 
    const input = document.createElement("input"); input.type = "text"; input.value = tag; input.style.flex = "1"; 
    input.addEventListener("change", async () => { 
      adviceTags[idx] = input.value; 
      renderAdviceTags(); renderAdviceInventory(); 
      await saveUserSettingsToCloud();
    }); 
    const delBtn = document.createElement("button"); delBtn.innerHTML = '<i class="fas fa-trash"></i>'; delBtn.className = "btn-sm btn-danger"; 
    delBtn.onclick = async () => { 
      adviceTags.splice(idx, 1); 
      renderAdviceTags(); renderAdviceInventory(); 
      await saveUserSettingsToCloud();
    }; 
    div.appendChild(input); div.appendChild(delBtn); container.appendChild(div); 
  }); 
  const addBtn = document.createElement("button"); addBtn.innerText = "+ Add New Advice"; addBtn.className = "btn-sm"; addBtn.style.marginTop = "8px"; 
  addBtn.onclick = async () => { 
    const newAdv = prompt("New advice:"); 
    if(newAdv && newAdv.trim()){ 
      adviceTags.push(newAdv.trim()); 
      renderAdviceTags(); renderAdviceInventory(); 
      await saveUserSettingsToCloud();
    } 
  }; 
  container.appendChild(addBtn); 
}

async function deleteAllAdvice(){ 
  if(confirm("Delete ALL advice templates?")){ 
    adviceTags = []; 
    renderAdviceTags(); renderAdviceInventory(); 
    await saveUserSettingsToCloud();
  } 
}

function openTagEditModal(type, title) { currentTagType = type; document.getElementById("tagEditTitle").innerText = title; renderTagEditList(); document.getElementById("tagEditModal").style.display = "block"; }

function renderTagEditList() { 
  const container = document.getElementById("tagEditList"); 
  let tags = []; 
  if(currentTagType === "freq") tags = userFreqTags; else if(currentTagType === "dur") tags = userDurTags; else tags = userHowTags; 
  container.innerHTML = ""; 
  tags.forEach((tag, idx) => { 
    const div = document.createElement("div"); div.style.display = "flex"; div.style.alignItems = "center"; div.style.gap = "8px"; div.style.marginBottom = "6px"; 
    const inp = document.createElement("input"); inp.value = tag; inp.style.flex = "1"; 
    inp.addEventListener("change", async (e) => { 
      tags[idx] = e.target.value; 
      renderTagEditList();
      await saveUserSettingsToCloud();
    }); 
    const del = document.createElement("button"); del.innerHTML = '<i class="fas fa-trash"></i>'; del.className = "btn-sm btn-danger"; 
    del.onclick = async () => { 
      tags.splice(idx, 1); 
      renderTagEditList(); 
      await saveUserSettingsToCloud();
    }; 
    div.appendChild(inp); div.appendChild(del); container.appendChild(div); 
  }); 
}

async function addNewTag() { 
  const newTag = document.getElementById("newTagInput").value.trim(); if(!newTag) return; 
  let tags = currentTagType === "freq" ? userFreqTags : (currentTagType === "dur" ? userDurTags : userHowTags); 
  if(!tags.includes(newTag)) tags.push(newTag); 
  renderTagEditList(); 
  document.getElementById("newTagInput").value = ""; 
  await saveUserSettingsToCloud();
}

function saveTagEditAndClose() { 
  if(currentTagType === "freq") renderTagGroup("freqTagsContainer", userFreqTags, "freq"); 
  else if(currentTagType === "dur") renderTagGroup("durTagsContainer", userDurTags, "dur"); 
  else renderTagGroup("howTagsContainer", userHowTags, "how"); 
  document.getElementById("tagEditModal").style.display = "none"; 
}

function initWorkspace(){ 
  currentSerial = generateSerial(); 
  resetCurrentDraft(); 
  renderMedicineList(""); 
  renderMostUsed(); 
  renderAdviceTags(); 
  setupSearchSuggestions(); 
  updatePreview(); 
  renderPinnedSection(); 
}

function bindEvents() {
  document.getElementById("searchMedicine").addEventListener("input", e => renderMedicineList(e.target.value));
  document.getElementById("clearAllMedicinesBtn").addEventListener("click", () => { currentMedicines = []; renderMedicinesTable(); updatePreview(); });
  document.getElementById("quickMedicineBtn").addEventListener("click", openQuickPopup);
  document.getElementById("bulkTriggerBtn").addEventListener("click", () => document.getElementById("bulkMedFile").click());
  document.getElementById("bulkMedFile").addEventListener("change", e => { if(e.target.files[0]) importMedicinesFromFile(e.target.files[0]); e.target.value = ""; });
  document.getElementById("addCustomAdviceBtn").addEventListener("click", () => { const val = document.getElementById("customAdviceInput").value.trim(); if(val) addAdvice(val); document.getElementById("customAdviceInput").value = ""; });
  document.getElementById("showHistoryBtn").addEventListener("click", showHistoryModal);
  document.getElementById("analysisBtn").addEventListener("click", showAnalysis);
  document.getElementById("helpBtn").addEventListener("click", showHelp);
  document.getElementById("savePrescriptionBtn").addEventListener("click", saveCurrentPrescription);
  document.getElementById("printPreviewBtn").addEventListener("click", printWithMargin);
  document.getElementById("clearCurrentBtn").addEventListener("click", resetCurrentDraft);
  document.getElementById("modalConfirmBtn").addEventListener("click", addMedicineFromPopup);
  document.getElementById("modalCancelBtn").addEventListener("click", closeModal);
  document.getElementById("quickConfirmBtn").addEventListener("click", addQuickMedicine);
  document.getElementById("quickCancelBtn").addEventListener("click", closeQuickPopup);
  document.getElementById("applyHistoryFilter").addEventListener("click", () => renderHistoryList());
  document.getElementById("resetHistoryFilter").addEventListener("click", resetHistoryFilters);
  document.getElementById("closeHistoryModal").addEventListener("click", () => document.getElementById("historyModal").style.display = "none");
  document.getElementById("closeAnalysisModal").addEventListener("click", () => document.getElementById("analysisModal").style.display = "none");
  document.getElementById("applyAnalysisFilter").addEventListener("click", updateAnalysisDashboard);
  document.getElementById("resetAnalysisFilter").addEventListener("click", resetAnalysisFilters);
  
  window.addEventListener("click", e => { 
    if(e.target === document.getElementById("historyModal")) document.getElementById("historyModal").style.display = "none"; 
    if(e.target === document.getElementById("analysisModal")) document.getElementById("analysisModal").style.display = "none"; 
    if(e.target === document.getElementById("medicineInventoryModal")) document.getElementById("medicineInventoryModal").style.display = "none"; 
    if(e.target === document.getElementById("adviceInventoryModal")) document.getElementById("adviceInventoryModal").style.display = "none"; 
    if(e.target === document.getElementById("tagEditModal")) document.getElementById("tagEditModal").style.display = "none"; 
  });
  
  document.getElementById("manageMedsBtn").addEventListener("click", openMedicineInventory);
  document.getElementById("closeInventoryModal").addEventListener("click", () => document.getElementById("medicineInventoryModal").style.display = "none");
  document.getElementById("closeInventoryBtn").addEventListener("click", () => document.getElementById("medicineInventoryModal").style.display = "none");
  document.getElementById("deleteAllMedsBtn").addEventListener("click", deleteAllMedicines);
  document.getElementById("addInventoryMedicineBtn").addEventListener("click", addInventoryMedicine);
  document.getElementById("manageAdviceBtn").addEventListener("click", openAdviceInventory);
  document.getElementById("closeAdviceInventoryModal").addEventListener("click", () => document.getElementById("adviceInventoryModal").style.display = "none");
  document.getElementById("closeAdviceInventoryBtn").addEventListener("click", () => document.getElementById("adviceInventoryModal").style.display = "none");
  document.getElementById("deleteAllAdviceBtn").addEventListener("click", deleteAllAdvice);
  document.getElementById("editFreqTagsBtn").addEventListener("click", () => openTagEditModal("freq", "Edit Frequency Tags"));
  document.getElementById("editDurTagsBtn").addEventListener("click", () => openTagEditModal("dur", "Edit Duration Tags"));
  document.getElementById("editHowTagsBtn").addEventListener("click", () => openTagEditModal("how", "Edit 'How to take' Tags"));
  document.getElementById("addNewTagBtn").addEventListener("click", addNewTag);
  document.getElementById("saveTagEditBtn").addEventListener("click", saveTagEditAndClose);
  document.getElementById("cancelTagEditBtn").addEventListener("click", () => document.getElementById("tagEditModal").style.display = "none");
  
  ["firstName", "lastName", "patientAge", "patientGender", "diagnosisField"].forEach(id => document.getElementById(id)?.addEventListener("input", updatePreview));
  document.querySelectorAll('input[name="paperStyle"]').forEach(r => r.addEventListener("change", () => updatePreview()));
}

function escapeHtml(s){ if(!s) return ""; return s.replace(/[&<>]/g, function(m){ if(m === '&') return '&amp;'; if(m === '<') return '&lt;'; if(m === '>') return '&gt;'; return m; }); }

// Bind Core Events
bindEvents();
