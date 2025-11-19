function initNutriScanner() {
    const state = {
        lastImage: null,
        cameraActive: false,
        stream: null,
        allergies: [],
        worker: null  // ← persistent worker (no re-creation = no hanging)
    };

    // ==================== TESSERACT WORKER (REUSED – NEVER HANGS) ====================
    async function ensureWorker() {
        if (state.worker) return state.worker;

        state.worker = await Tesseract.createWorker({
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    document.getElementById('nutrition-list').innerHTML = `Scanning... ${progress}%`;
                    document.getElementById('ingredient-list').innerHTML = `Scanning... ${progress}%`;
                }
            }
        });

        await state.worker.load();
        await state.worker.loadLanguage('eng');
        await state.worker.initialize('eng');

        // Best settings for nutrition labels
        await state.worker.setParameters({
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz %.,:-()[]mgkgcalorieskcalsugarsodiumsaltfatproteincarbsfiber',
            preserve_interword_spaces: '1',
            tessedit_pageseg_mode: '6',  // Assume a single block of text
        });

        return state.worker;
    }

    // ==================== SUPER ACCURATE NUTRITION PARSER ====================
    function parseNutrition(text) {
        const lines = text.toLowerCase().split('\n');
        const result = { calories: null, fat: null, sugar: null, sodium: null };

        for (let line of lines) {
            line = line.replace(/[^a-z0-9.%\s]/g, ' ').trim();

            // Calories
            if (!result.calories && /(calorie|energy|kcal)/.test(line)) {
                const match = line.match(/(\d{2,4})/);
                if (match && parseInt(match[1]) > 10 && parseInt(match[1]) < 4000) {
                    result.calories = parseInt(match[1]);
                }
            }

            // Total Fat
            if (!result.fat && /total.? ?fat/.test(line)) {
                const match = line.match(/(\d+(?:\.\d+)?)\s*g/);
                if (match) result.fat = parseFloat(match[1]).toFixed(1);
            }

            // Sugars
            if (!result.sugar && /(total sugars?|sugars?)/.test(line) && !/added/.test(line)) {
                const match = line.match(/(\d+(?:\.\d+)?)\s*g/);
                if (match) result.sugar = parseFloat(match[1]).toFixed(1);
            }

            // Sodium
            if (!result.sodium && /(sodium|salt|na)/.test(line)) {
                const match = line.match(/(\d+(?:\.\d+)?)\s*(mg|g)/);
                if (match) {
                    let val = parseFloat(match[1]);
                    if (match[2] === 'g') val *= 1000;
                    result.sodium = Math.round(val);
                }
            }
        }
        return result;
    }

    function displayNutrition(data) {
        const container = document.getElementById('nutrition-list');
        let html = '';

        if (data.calories !== null)
            html += `<div class="result-box ${data.calories < 150 ? 'good' : data.calories < 350 ? 'okay' : 'bad'}">
                        Calories <strong>${data.calories}</strong>
                     </div>`;

        if (data.fat !== null)
            html += `<div class="result-box ${data.fat < 5 ? 'good' : data.fat < 15 ? 'okay' : 'bad'}">
                        Total Fat <strong>${data.fat}g</strong>
                     </div>`;

        if (data.sugar !== null)
            html += `<div class="result-box ${data.sugar < 5 ? 'good' : data.sugar < 12 ? 'okay' : 'bad'}">
                        Sugar <strong>${data.sugar}g</strong>
                     </div>`;

        if (data.sodium !== null)
            html += `<div class="result-box ${data.sodium < 140 ? 'good' : data.sodium < 400 ? 'okay' : 'bad'}">
                        Sodium <strong>${data.sodium}mg</strong>
                     </div>`;

        if (!html) html = '<div class="result-box bad">Could not detect nutrition info. Try a clearer photo.</div>';

        container.innerHTML = html;
    }

    function checkAllergens(text) {
        const lower = text.toLowerCase();
        return state.allergies.filter(allergy => lower.includes(allergy));
    }

    function displayAllergenWarnings(found) {
        const container = document.getElementById('ingredient-list');
        if (found.length === 0) {
            container.innerHTML = `<div class="result-box good" style="font-size:3rem;padding:60px">
                                      All Clear – Safe to Eat!
                                   </div>`;
        } else {
            container.innerHTML = `<div class="result-box bad" style="font-size:3rem;padding:60px">
                                      Contains: <strong>${found.map(a => a.toUpperCase()).join(', ')}</strong><br><br>
                                      NOT SAFE!
                                   </div>`;
        }
    }

    // ==================== SCAN FUNCTIONS (NOW NEVER FREEZE) ====================
    async function scanNutrition() {
        if (!state.lastImage && state.cameraActive) captureImage();
        if (!state.lastImage) return alert("Please take or upload a photo first");

        document.getElementById('nutrition-results').classList.remove('hidden');
        document.getElementById('ingredient-results').classList.add('hidden');
        document.getElementById('nutrition-list').innerHTML = "Initializing scanner...";

        try {
            const worker = await ensureWorker();
            const { data: { text } } = await worker.recognize(state.lastImage);
            const nutrients = parseNutrition(text);
            displayNutrition(nutrients);
        } catch (err) {
            console.error(err);
            document.getElementById('nutrition-list').innerHTML = '<p style="color:red">Scan failed – try better lighting or angle</p>';
        }
    }

    async function scanIngredients() {
        if (!state.lastImage && state.cameraActive) captureImage();
        if (!state.lastImage) return alert("Please take or upload a photo first");

        document.getElementById('ingredient-results').classList.remove('hidden');
        document.getElementById('nutrition-results').classList.add('hidden');
        document.getElementById('ingredient-list').innerHTML = "Scanning ingredients...";

        try {
            const worker = await ensureWorker();
            const { data: { text } } = await worker.recognize(state.lastImage);
            const found = checkAllergens(text);
            displayAllergenWarnings(found);
        } catch (err) {
            document.getElementById('ingredient-list').innerHTML = '<p style="color:red">Scan failed</p>';
        }
    }

    // ==================== CAMERA & IMAGE HANDLING ====================
    function captureImage() {
        const video = document.getElementById('camera-feed');
        if (!video || video.readyState < 2) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        state.lastImage = canvas.toDataURL('image/jpeg', 0.92);
        showImagePreview(state.lastImage);
    }

    function showImagePreview(src) {
        const img = document.getElementById('uploaded-img');
        const preview = document.getElementById('image-preview');
        if (img) img.src = src;
        if (preview) preview.classList.remove('hidden');

        // Enable scan buttons
        document.getElementById('scan-nutrition')?.removeAttribute('disabled');
        document.getElementById('scan-ingredients')?.removeAttribute('disabled');
    }

    function clearImage() {
        state.lastImage = null;
        document.getElementById('image-preview')?.classList.add('hidden');
        document.getElementById('scan-nutrition')?.setAttribute('disabled', 'true');
        document.getElementById('scan-ingredients')?.setAttribute('disabled', 'true');
    }

    // ==================== EVENT LISTENERS ====================
    document.getElementById('profile-form')?.addEventListener('submit', e => {
        e.preventDefault();
        state.allergies = Array.from(document.querySelectorAll('input[name="allergy"]:checked'))
            .map(c => c.value.toLowerCase());

        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');

        // Auto-start camera on mobile
        if (navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
                .then(stream => {
                    state.stream = stream;
                    state.cameraActive = true;
                    document.getElementById('camera-feed').srcObject = stream;
                })
                .catch(() => console.log("Camera denied"));
        }
    });

    document.getElementById('scan-nutrition')?.addEventListener('click', scanNutrition);
    document.getElementById('scan-ingredients')?.addEventListener('click', scanIngredients);
    document.getElementById('capture-btn')?.addEventListener('click', captureImage);

    // File upload support
    document.getElementById('file-input')?.addEventListener('change', e => {
        if (e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = () => {
                state.lastImage = reader.result;
                showImagePreview(state.lastImage);
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    // Optional: expose for debugging
    window.nutriDebug = { state, captureImage, scanNutrition, scanIngredients };
}

// ALWAYS START HERE
document.addEventListener('DOMContentLoaded', initNutriScanner);
