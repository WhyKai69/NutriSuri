function applyTrafficLightColors() {
    const cards = document.querySelectorAll('#nutrition-list .result-card');
    if (!cards.length || !state.bmi || !state.bmiCategory) return;

    const thresholds = {
        'Underweight':   { energy: [150, 300], sugars: [8, 16], salt: [0.3, 0.6] },
        'Normal weight': { energy: [200, 400], sugars: [10, 20], salt: [0.3, 0.8] },
        'Overweight':    { energy: [150, 300], sugars: [6, 12], salt: [0.2, 0.6] },
        'Obesity':       { energy: [100, 200], sugars: [4, 10], salt: [0.1, 0.4] }
    };
    const limits = thresholds[state.bmiCategory] || thresholds['Normal weight'];

    cards.forEach(card => {
        const valueEl = card.querySelector('strong');
        if (!valueEl) return;
        const value = parseFloat(valueEl.textContent);
        if (isNaN(value)) return;

        card.classList.remove('green', 'yellow', 'red');

        let type = '';
        if (card.classList.contains('energy')) type = 'energy';
        else if (card.classList.contains('sugars')) type = 'sugars';
        else if (card.classList.contains('salt')) type = 'salt';
        else return;

        const [low, high] = limits[type];
        if (value <= low) card.classList.add('green');     // SAFE TO EAT
        else if (value <= high) card.classList.add('yellow'); // CAUTION
        else card.classList.add('red');                  // AVOID
    });
}

function updateUKLabel(data) {
    const n = data._raw || {};
    const set = (id, val, unit) => {
        const sub = document.getElementById(id + '-sub');
        const right = document.getElementById(id + '-right');
        if (val !== undefined) {
            sub.textContent = `${Math.round(val)} ${unit}`;
            if (id === 'energy') {
                right.textContent = `${Math.min(100, Math.round(val / 20))}%`;
                right.style.background = '#e2e8f0';
                right.style.color = '#111';
            } else {
                let color = '';
                if (id === 'sugars') color = val <= 5 ? 'uk-green' : val <= 22.5 ? 'uk-amber' : 'uk-red';
                if (id === 'salt') color = val <= 0.3 ? 'uk-green' : val <= 1.5 ? 'uk-amber' : 'uk-red';
                right.className = 'uk-right ' + color;
            }
        }
    };
    set('energy', n.energy_kcal, 'kcal');
    set('sugars', n.sugars_g, 'g');
    set('salt', n.salt_g, 'g');
}

function parseNutrition(text) {
    const out = {};
    const regexes = [
        [/energy|kcal|calories.*?(\d+(\.\d+)?)/i, 'energy_kcal'],
        [/sugar[s]?\b.*?(\d+(\.\d+)?)/i, 'sugars_g'],
        [/salt\b.*?(\d+(\.\d+)?)/i, 'salt_g']
    ];

    regexes.forEach(([re, key]) => {
        const m = text.match(re);
        if (m) out[key] = parseFloat(m[1]);
    });

    const arr = [];
    if (out.energy_kcal) arr.push({ name: "Energy", val: out.energy_kcal, unit: "kcal", type: "energy" });
    if (out.sugars_g) arr.push({ name: "Sugars", val: out.sugars_g, unit: "g", type: "sugars" });
    if (out.salt_g) arr.push({ name: "Salt", val: out.salt_g, unit: "g", type: "salt" });
    arr._raw = out;
    return arr;
}

function displayNutrition(list) {
    const container = document.getElementById('nutrition-list');
    container.innerHTML = "";
    list.forEach(i => {
        const card = document.createElement("div");
        card.className = `result-card ${i.type}`;
        card.innerHTML = `<div>${i.name} <small>(${i.val}${i.unit})</small></div><div><strong>${i.val}</strong></div>`;
        container.appendChild(card);
    });
    setTimeout(applyTrafficLightColors, 0);
}

const allergenKeywords = {
    lactose: [/milk/, /lactose/, /dairy/, /whey/, /casein/],
    egg:     [/egg/, /albumin/, /ovum/],
    seafood: [/shrimp/, /crab/, /lobster/, /fish/, /shellfish/],
    nuts:    [/nut/, /almond/, /cashew/, /walnut/, /peanut/],
    gluten:  [/wheat/, /barley/, /rye/, /gluten/],
    soy:     [/soy/, /soya/, /tofu/]
};

function checkAllergens(text) {
    const found = [];
    state.allergies.forEach(allergy => {
        if (allergenKeywords[allergy]?.some(re => re.test(text))) {
            found.push(allergy);
        }
    });
    return found;
}

function displayAllergenWarnings(allergens) {
    const container = document.getElementById('ingredient-list');
    const banner = document.getElementById('allergy-warning');

    container.innerHTML = "";
    if (banner) banner.classList.add('hidden');

    if (allergens.length === 0) {
        const card = document.createElement("div");
        card.className = "result-card";
        card.innerHTML = `<div>All Clear — Safe!</div>`;
        container.appendChild(card);
        return;
    }

    if (banner) {
        banner.innerHTML = `<strong>Warning:</strong> Contains ${allergens.map(a => a.toUpperCase()).join(', ')}!`;
        banner.classList.remove('hidden');
    }

    allergens.forEach(allergy => {
        const card = document.createElement("div");
        card.className = "result-card allergy";
        card.innerHTML = `<div>Contains <strong>${allergy.toUpperCase()}</strong></div>`;
        container.appendChild(card);
    });
}

function scanNutrition() {
    if (!state.lastImage && state.cameraActive) state.lastImage = captureImage();
    if (!state.lastImage) return alert("No image! Use camera or upload.");

    document.getElementById('nutrition-results').classList.remove('hidden');
    document.getElementById('ingredient-results').classList.add('hidden');
    document.getElementById('nutrition-list').innerHTML = "<p>Scanning nutrition...</p>";

    Tesseract.recognize(state.lastImage, 'eng')
        .then(({ data: { text } }) => {
            const nutrients = parseNutrition(text.toLowerCase());
            displayNutrition(nutrients);
            updateUKLabel(nutrients);
        })
        .catch(err => {
            document.getElementById('nutrition-list').innerHTML = "<p style='color:red'>Scan failed. Try again.</p>";
        });
}

function scanIngredients() {
    if (!state.lastImage && state.cameraActive) state.lastImage = captureImage();
    if (!state.lastImage) return alert("No image!");

    document.getElementById('ingredient-results').classList.remove('hidden');
    document.getElementById('nutrition-results').classList.add('hidden');
    document.getElementById('ingredient-list').innerHTML = "<p>Scanning ingredients...</p>";
    document.getElementById('allergy-warning').classList.add('hidden');

    Tesseract.recognize(state.lastImage, 'eng')
        .then(({ data: { text } }) => {
            const allergens = checkAllergens(text.toLowerCase());
            displayAllergenWarnings(allergens);
        })
        .catch(err => {
            document.getElementById('ingredient-list').innerHTML = "<p style='color:red'>Scan failed.</p>";
        });
}

function captureImage() {
    const video = document.getElementById('camera-feed');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    state.lastImage = canvas.toDataURL('image/jpeg');
    return state.lastImage;
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', e => {
        const files = e.dataTransfer.files;
        if (files.length) handleImage(files[0]);
    });

    fileInput.addEventListener('change', e => {
        if (e.target.files.length) handleImage(e.target.files[0]);
    });
}

function handleImage(file) {
    if (!file.type.startsWith('image/')) return alert('Please upload an image.');
    const reader = new FileReader();
    reader.onload = ev => {
        state.lastImage = ev.target.result;
        enableScanButtons();
        const dropZone = document.getElementById('drop-zone');
        dropZone.innerHTML = `<i class="fas fa-check-circle" style="color:green;"></i><strong>Image loaded!</strong><br><small>${file.name}</small>`;
        setTimeout(() => {
            dropZone.innerHTML = `<i class="fas fa-cloud-upload-alt"></i><strong>Drag & drop your photo here</strong><br>or click to select<small>Supports JPG, PNG, WEBP</small><input type="file" id="file-input" accept="image/*" hidden />`;
            document.getElementById('file-input').addEventListener('change', e => {
                if (e.target.files.length) handleImage(e.target.files[0]);
            });
        }, 2000);
    };
    reader.readAsDataURL(file);
}

function enableScanButtons() {
    document.getElementById('scan-nutrition').disabled = false;
    document.getElementById('scan-ingredients').disabled = false;
}

function disableScanButtons() {
    document.getElementById('scan-nutrition').disabled = true;
    document.getElementById('scan-ingredients').disabled = true;
}

// BUTTON LISTENERS
document.getElementById('scan-nutrition').addEventListener('click', scanNutrition);
document.getElementById('scan-ingredients').addEventListener('click', scanIngredients);

// Initialize
setupDragAndDrop();