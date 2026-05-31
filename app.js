async function runEngine() {
    console.log("Checking Firestore connection status...");
    try {
        // Quick connection test: write a dummy document to a test collection
        const testRef = await addDoc(collection(db, "connection_test"), {
            status: "Online",
            checkedAt: new Date()
        });
        console.log("Firestore Write Test: SUCCESS! Saved doc ID:", testRef.id);
        
        // Execute primary dashboard streams
        await loadMedicineTags();
        await loadPrescriptionHistory();
    } catch (err) {
        console.error("Firestore Core Connection FAILED:", err.message);
        alert("Firebase Connection Error: " + err.message);
    }
}
runEngine();
